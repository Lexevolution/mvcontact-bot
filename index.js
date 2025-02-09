const signalR = require("@microsoft/signalr");
const {randomUUID, createHash, randomBytes} = require("crypto");
const EventEmitter = require('events');
const {botLog} = require("./logging");
const path = require("path");

const baseAPIURL = "https://api.resonite.com";
const resoniteKey = "oi+ISZuYtMYtpruYHLQLPkXgPaD+IcaRNXPI7b3Z0iYe5+AcccouLYFI9vloMmYEYDlE1PhDL52GsddfxgQeK4Z_hem84t1OXGUdScFkLSMhJA2te86LBL_rFL4JjO4F_hHHIJH1Gm1IYVuvBQjpb89AJ0D6eamd7u4MxeWeEVE=";
const botUID = GenerateUID();

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
            "autoAcceptFriendRequests": inConfig.autoAcceptFriendRequests ?? "all",
            "autoExtendLogin": inConfig.autoExtendLogin ?? true,
            "updateStatus": inConfig.updateStatus ?? true,
            "readMessagesOnReceive": inConfig.readMessagesOnReceive ?? true,
            "versionName": inConfig.versionName ?? "Resonite Contact Bot",
            "logToFile": inConfig.logToFile ?? true,
            "logPath": inConfig.logPath ?? "./"
        }
        this.data = {
            "currentMachineID": GenerateRandomMachineId(),
            "sessionId": randomUUID(),
            "userId": "",
            "token": "",
            "fullToken": "",
            "tokenExpiry": "",
            "loggedIn": false,
            "whitelist": []
        }
        this.autoRunners = {};
        this.signalRConnection = undefined;
        this.logger = new botLog(this.config.username, this.config.logToFile, this.config.logPath);
    }

    async login() {
        const loginData = {
            "username": this.config.username,
            "authentication": {
                "$type": "password",
                "password": this.config.password
            },
            "rememberMe": false,
            "secretMachineId": this.data.currentMachineID
        };

        const res = await fetch(`${baseAPIURL}/userSessions`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": JSON.stringify(loginData).length,
                    "UID": botUID,
                    "TOTP": this.config.TOTP
                },
                body: JSON.stringify(loginData)
            }
        );
        
        if (res.status === 200){
            const loginResponse = await res.json();
            this.data.userId = loginResponse.entity.userId;
            this.data.token = loginResponse.entity.token;
            this.data.fullToken = `res ${loginResponse.entity.userId}:${loginResponse.entity.token}`;
            this.data.tokenExpiry = loginResponse.entity.expire;
            this.data.loggedIn = true;
            await this.logger.log("INFO", `Successfully logged in as ${loginResponse.entity.userId}`);
        }
        else {
            await this.logger.log("ERROR", `Unexpected return code ${res.status}: ${await res.text()}`);
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
        const res = await fetch(`${baseAPIURL}/userSessions/${this.data.userId}/${this.data.token}`,
            {
                method: "DELETE",
                headers: {
                    "Authorization": this.data.fullToken
                }
            }
        );
        if (res.status !== 200){
            await this.logger.log("ERROR", `Unexpected HTTP status when logging out (${res.status} ${res.statusText}): ${res.body}`);
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
        await this.startSignalR();
        await setTimeout(() => {
            this.runAutoFriendAccept();
            this.runStatusUpdate();
        }, 5000);
        this.autoRunners.autoAcceptFriendRequests = setInterval(this.runAutoFriendAccept.bind(this), 120000);
        this.autoRunners.updateStatus = setInterval(this.runStatusUpdate.bind(this), 90000);
        this.autoRunners.extendLogin = setInterval(this.extendLogin.bind(this), 600000);
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
        let friendList = [];
        if (this.config.autoAcceptFriendRequests !== "none"){
            const res = await fetch(`${baseAPIURL}/users/${this.data.userId}/contacts`,
                {headers: {"Authorization": this.data.fullToken}}
            );

            await res.json().then(friends => {
                friends.forEach(friend => {
                    if (friend.friendStatus == "Requested"){
                        friendList.push(friend);
                    }
                });
            });
        }

        if (this.config.autoAcceptFriendRequests === "list"){
            friendList = friendList.filter(friend => this.data.whitelist.includes(friend.id));
        }

        friendList.forEach(async friend => {
            friend.friendStatus = "Accepted";

            await this.signalRConnection.send("UpdateContact", friend)
            .catch((err) => {
                this.logger.log("ERROR", `Error adding contact ${friend.id}: ${err}`);
                throw new Error(err);
            });
            this.emit("addedContact", friend.id);
        });
    }

    async runStatusUpdate() {
        if (this.config.updateStatus){
            const statusUpdateData = {
                "userId": this.data.userId,
                "onlineStatus": "Online",
                "outputDevice": "Unknown",
                "sessionType": "Bot",
                "userSessionId": this.data.sessionId,
                "isPresent": true,
                "lastPresenceTimestamp": new Date(Date.now()).toISOString(),
                "lastStatusChange": new Date(Date.now()).toISOString(),
                "compatibilityHash": "mvcontactbot",
                "appVersion": this.config.versionName,
                "isMobile": false
            }

            const statusUpdateGroup = {
                "group": 1,
                "targetIds": null
            }

            //await this.logger.log("DEBUG", `Broadcasting Status: ${JSON.stringify(statusUpdateData)}`);
            await this.signalRConnection.send("BroadcastStatus", statusUpdateData, statusUpdateGroup)
            .catch((err) => {
                throw new Error(err);
            });
        }
    }

    async extendLogin() {
        if (this.config.autoExtendLogin){
            if ((Date.parse(this.data.tokenExpiry) - 600000) < Date.now()){
                await this.logger.log("INFO", "Extending login");
                const res = await fetch(`${baseAPIURL}/userSessions`,
                    {
                        method: "PATCH",
                        headers: {
                            "Authorization": this.data.fullToken
                        }
                    }
                );
                
                if (res.ok){
                    this.data.tokenExpiry = (new Date(Date.now() + 8.64e+7)).toISOString();
                    await this.logger.log("INFO", "Successfully extended login session.");
                }
                else{
                    await this.logger.log("ERROR", `Couldn't extend login (${res.status} ${res.statusText}): ${await res.text()}`);
                }
            }
        }
    }

    async startSignalR() {
        //Connect to SignalR
        this.signalRConnection = new signalR.HubConnectionBuilder()
            .withUrl(`${baseAPIURL}/hub`, {
                headers: {
                    "Authorization": this.data.fullToken,
                    "UID": this.data.currentMachineID,
                    "SecretClientAccessKey": resoniteKey
                }
            })
            .withAutomaticReconnect()
            .configureLogging(signalR.LogLevel.Critical)
            .build();
    
        await this.signalRConnection.start().catch(async (err) => {
            await this.logger.log("ERROR", err);
            throw new Error(err);
        });
    
        //Actions whenever a message is received
        this.signalRConnection.on("ReceiveMessage", async (message) => {
            await this.logger.log("INFO", `Received ${message.messageType} message from ${message.senderId}: ${message.content}`);
            if (this.config.readMessagesOnReceive){
                let readMessageData = {
                        "senderId": message.senderId,
                        "readTime": (new Date(Date.now())).toISOString(),
                        "ids": [
                            message.id
                        ]
                }

                await this.signalRConnection.send("MarkMessagesRead", readMessageData).catch(
                    (reason) => {
                        this.logger.log("ERROR", reason);
                    }
                );
            }
            
            this.emit("receiveRawMessage", message);
            switch (message.messageType){
                case "Text":
                    this.emit("receiveTextMessage", message.senderId, message.content);
                    break;
                case "Sound":
                    this.emit("receiveSoundMessage", message.senderId, `https://assets.resonite.com/${JSON.parse(message.content).assetUri.slice(9,74)}`);
                    break;
                case "Object":
                    this.emit("receiveObjectMessage", message.senderId, JSON.parse(message.content).name, `https://assets.resonite.com/${JSON.parse(message.content).assetUri.slice(9,74)}`);
                    break;
                case "SessionInvite":
                    this.emit("receiveSessionInviteMessage", message.senderId, JSON.parse(message.content).name, JSON.parse(message.content).sessionId);
                    break;
                default:
                    await this.logger.log("WARNING", "Couldn't find a message type match!");
            }
        });
    
        this.signalRConnection.on("MessageSent", async (data) => {
            await this.logger.log("INFO", `Sent ${data.messageType} message to ${data.recipientId}: ${data.content}`);
        });
    }

    async removeFriend(friendId){
        const res = await fetch(`${baseAPIURL}/users/${this.data.userId}/contacts`,
        {
            headers: {
                "Authorization": this.data.fullToken
            }
        });
        const resData = await res.json();
        let friendToRemove = resData.find(friend => friend.id == friendId);
        friendToRemove.contactStatus = "Ignored";

        await this.signalRConnection.send("UpdateContact", friendToRemove)
        .catch(async (err) => {
            await this.logger.log("ERROR", `Couldn't remove contact: ${err}`);
            throw new Error(`Couldn't remove contact: ${err}`);
        });

        if (res.status !== 200){
            this.logger.log("ERROR", `Unexpected error when trying to remove ${friendId}: ${res.status} ${res.statusText}${res.bodyUsed ? ': ' + res.body : '.'}`);
            throw new Error(`Unexpected error when trying to remove ${friendId}: ${res.status} ${res.statusText}${res.bodyUsed ? ': ' + res.body : '.'}`);
        }
    }

    async addFriend(friendId){
        const res = await fetch(`${baseAPIURL}/users/${friendId}`);
        const resData = await res.json();
        const requestedFriend = {
            "ownerId": this.data.userId,
            "id": friendId,
            "contactUsername": resData.username,
            "contactStatus": "Accepted"
        };

        await this.signalRConnection.send("UpdateContact", requestedFriend)
        .catch(async (err) => {
            await this.logger.log("ERROR", `Couldn't add contact: ${err}`);
            throw new Error(`Couldn't add contact: ${err}`);
        });
    }

    async sendRawMessage(messageData){
        await this.signalRConnection.send("SendMessage", messageData)
        .catch(async (err) => {
            await this.logger.log("ERROR", `Couldn't send message: ${err}`);
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
        .catch(async (err) => {
            await this.logger.log("ERROR", `Couldn't send message: ${err}`);
            throw new Error(`Couldn't send message: ${err}`);
        });
    }
}

function GenerateRandomMachineId(){
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_';
    for (let i = 0; i < 128; i++){
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

function GenerateUID(){
    let result = '';
    const data = `mvcontact-bot-${randomBytes(16).toString('base64')}`;
    result = createHash('sha256').update(data).digest('hex').toUpperCase();
    return result;
}

module.exports = {MVContactBot};    