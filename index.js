const signalR = require("@microsoft/signalr");
const {randomUUID} = require("crypto");
const EventEmitter = require('events');

const baseAPIURL = "api.neos.com";

/**
 * Does a cool thing
 * @class
 * @param inConfig is a cool object full of settings.
 */
class MVContactBot extends EventEmitter {
    constructor(inConfig) {
        super();
        this.config = {
            "username": inConfig.username,
            "password": inConfig.password,
            "TOTP": inConfig.TOTP ?? "",
            "autoAcceptFriendRequests": inConfig.autoAcceptFriendRequests ?? true,
            "autoExtendLogin": inConfig.autoExtendLogin ?? true,
            "updateStatus": inConfig.updateStatus ?? true,
            "readMessagesOnReceive": inConfig.readMessagesOnReceive ?? true,
            "versionName": inConfig.versionName ?? "Neos Contact Bot"
        }
        this.data = {
            "currentMachineID": GenerateRandomMachineId(),
            "userId": "",
            "token": "",
            "fullToken": "",
            "tokenExpiry": "",
            "loggedIn": false
        }
        this.autoRunners = {};
        this.signalRConnection = undefined;
    }

    async login() {
        const loginData = {
            "username": this.config.username,
            "password": this.config.password,
            "rememberMe": false,
            "secretMachineId": this.data.currentMachineID
        };

        const res = await fetch(`https://${baseAPIURL}/api/userSessions`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": JSON.stringify(loginData).length,
                    "TOTP": this.config.TOTP
                },
                body: JSON.stringify(loginData)
            }
        );
        
        if (res.status === 200){
            const loginResponse = await res.json();
            this.data.userId = loginResponse.userId;
            this.data.token = loginResponse.token;
            this.data.fullToken = `neos ${loginResponse.userId}:${loginResponse.token}`;
            this.data.tokenExpiry = loginResponse.expire;
            this.data.loggedIn = true;
        }
        else {
            throw new Error(`Unexpected return code ${res.status}: ${await res.text()}`);
        }
    }

    async logout(){
        if(this.signalRConnection !== undefined){
            throw new Error("Please stop this bot before logging out.");
        }
        else if(!this.data.loggedIn){
            throw new Error("This bot is already logged out!");
        }
        const res = await fetch(`https://${baseAPIURL}/api/userSessions/${this.data.userId}/${this.data.token}`,
            {
                method: "DELETE",
                headers: {
                    "Authorization": this.data.fullToken
                }
            }
        );
        if (res.status !== 200){
            throw new Error(`Unexpected HTTP status when logging out (${res.status} ${res.statusText}): ${res.body}`);
        }
        
        this.data.loggedIn = false;
        this.data.fullToken = "";
        this.data.token = "";
        this.data.userId = "";
    }

    async start(){
        //Need to check if logged in
        if (!this.data.loggedIn){
            throw new Error("This bot isn't logged in!");
        }
        if (this.signalRConnection !== undefined){
            throw new Error("This bot has already been started!");
        }
        this.runAutoFriendAccept();
        this.runStatusUpdate();
        this.autoRunners.autoAcceptFriendRequests = setInterval(this.runAutoFriendAccept.bind(this), 120000);
        this.autoRunners.updateStatus = setInterval(this.runStatusUpdate.bind(this), 90000);
        this.autoRunners.extendLogin = setInterval(this.extendLogin.bind(this), 600000);
        await this.startSignalR();
    }

    async stop(){
        if (this.signalRConnection === undefined){
            throw new Error("This bot hasn't been started yet, so cannot stop.");
        }
        await this.signalRConnection.stop();
        clearInterval(this.autoRunners.autoAcceptFriendRequests);
        clearInterval(this.autoRunners.updateStatus);
        clearInterval(this.autoRunners.extendLogin);
        this.signalRConnection = undefined;
    }

    async runAutoFriendAccept() {
        if (this.config.autoAcceptFriendRequests){
            console.log("Start auto accept friend requests.");
            let friendList = [];
            const res = await fetch(`https://${baseAPIURL}/api/users/${this.data.userId}/friends`,
                {headers: {"Authorization": this.data.fullToken}}
            );

            await res.json().then(friends => {
                friends.forEach(friend => {
                    if (friend.friendStatus == "Requested"){
                        friendList.push(friend);
                    }
                });
            });

            friendList.forEach(async friend => {
                friend.friendStatus = "Accepted";
                const res = await fetch(`https://${baseAPIURL}/api/users/${this.data.userId}/friends/${friend.id}`,
                    {
                        method: "PUT",
                        headers: {
                            "Authorization": this.data.fullToken,
                            "Content-Type": "application/json",
                            "Content-Length": JSON.stringify(friend).length
                        },
                        body: JSON.stringify(friend)
                    }
                );

                if (res.status === 200){
                    console.log(`Successfully added ${friend.id} as a contact!`);
                }
                else if (res.ok){
                    console.log(`Success HTTP ${res.status}: ${await res.text()}`);
                }
                else {
                    throw new Error(`Error adding contact ${friend.id} (HTTP ${res.status}): ${await res.text()}`);
                }
            });
        }
    }

    async runStatusUpdate() {
        if (this.config.updateStatus){
            let statusUpdateData = {
                "onlineStatus": "Online",
                "lastStatusChange": "",
                "compatibilityHash": "mvcontactbot",
                "neosVersion": this.config.versionName,
                "outputDevice": "Unknown",
                "isMobile": false,
                "currentSessionHidden": false,
                "currentHosting": true,
                "currentSessionAccessLevel": 0
            }
            
            console.log("Start updating status");
            statusUpdateData.lastStatusChange = (new Date(Date.now())).toISOString();
            const res = await fetch(`https://${baseAPIURL}/api/users/${this.data.userId}/status`,
                {
                    method: "PUT",
                    headers: {
                        "Authorization": this.data.fullToken,
                        "Content-Type": "application/json",
                        "Content-Length": JSON.stringify(statusUpdateData).length
                    },
                    body: JSON.stringify(statusUpdateData)
                }
            );

            if (res.status === 200) {
                console.log("Status update successful!");
            }
            else {
                throw new Error(await res.text());
            }
        }
    }

    async extendLogin() {
        if (this.config.autoExtendLogin){
            if ((Date.parse(this.data.tokenExpiry) - 600000) < Date.now()){
                console.log("Extending login");
                const res = await fetch(`https://${baseAPIURL}/api/userSessions`,
                    {
                        method: "PATCH",
                        headers: {
                            "Authorization": this.data.fullToken
                        }
                    }
                );
                
                if (res.ok){
                    this.data.tokenExpiry = (new Date(Date.now() + 8.64e+7)).toISOString();
                    console.log("Successfully extended login session.");
                }
                else{
                    throw new Error("Couldn't extend login.");
                }
            }
        }
    }

    async startSignalR() {
        //Connect to SignalR
        this.signalRConnection = new signalR.HubConnectionBuilder()
            .withUrl("https://api.neos.com/hub", {
                headers: {
                    "Authorization": this.data.fullToken,
                    "UID": this.data.currentMachineID
                }
            })
            .withAutomaticReconnect()
            .configureLogging(signalR.LogLevel.Critical)
            .build();
    
        await this.signalRConnection.start().catch((err) => {
            throw new Error(err);
        });
    
        //Actions whenever a message is received
        this.signalRConnection.on("ReceiveMessage", (message) => {
            console.log(`Received ${message.messageType} message from ${message.senderId}: ${message.content}`);
            if (this.config.readMessagesOnReceive){
                let readMessageData = {
                        "senderId": message.senderId,
                        "readTime": (new Date(Date.now())).toISOString(),
                        "ids": [
                            message.id
                        ]
                }

                this.signalRConnection.send("MarkMessagesRead", readMessageData);
            }
            
            this.emit("receiveRawMessage", message);
            switch (message.messageType){
                case "Text":
                    this.emit("receiveTextMessage", message.senderId, message.content);
                    break;
                case "Sound":
                    this.emit("receiveSoundMessage", message.senderId, `https://assets.neos.com/assets/${JSON.parse(message.content).assetUri.slice(10,74)}`);
                    break;
                case "Object":
                    this.emit("receiveObjectMessage", message.senderId, JSON.parse(message.content).name, `https://assets.neos.com/assets/${JSON.parse(message.content).assetUri.slice(10,74)}`);
                    break;
                case "SessionInvite":
                    this.emit("receiveSessionInviteMessage", message.senderId, JSON.parse(message.content).name, JSON.parse(message.content).sessionId);
                    break;
                default:
                    console.log("Couldn't find a message type match!");
            }
        });
    
        this.signalRConnection.on("MessageSent", (data) => {
            console.log(`Sent ${data.messageType} message to ${data.recipientId}: ${data.content}`);
        });
    }

    async sendRawMessage(messageData){
        await this.signalRConnection.send("SendMessage", messageData)
        .catch((err) => {
            throw new Error(`Couldn't send message: ${err}`);
        });
    }

    async sendTextMessage(recipientUser, textMessage){
        const messageData = {
            "id": `MSG-${randomUUID()}`,
            "senderId": this.data.userId,
            "recipientId": recipientUser,
            "messageType": "Text",
            "sendTime": (new Date(Date.now())).toISOString(),
            "lastUpdateTime": (new Date(Date.now())).toISOString(),
            "content": textMessage
        }

        await this.signalRConnection.send("SendMessage", messageData)
        .catch((err) => {
            throw new Error(`Couldn't send message: ${err}`);
        });
    }
}

function GenerateRandomMachineId(){
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 12; i++){
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

module.exports = {MVContactBot};