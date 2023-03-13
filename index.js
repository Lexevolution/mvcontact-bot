const https = require('https');
const config = require("./config.json");
const signalR = require("@microsoft/signalr");
const {randomUUID} = require("crypto");

const baseAPIURL = "api.neos.com";
const currentMachineID = GenerateRandomMachineId()
//Read Config
const loginData = {
    "username": config.username,
    "password": config.password,
    "rememberMe": false,
    "secretMachineId": currentMachineID
};

let loggedInData = {
    "token": "",
    "userId": "",
    "expiry": "",
    "fullToken": ""
}

//Login
console.log(`Logging in...`);
const loginHeaders = {
    "Content-Type": "application/json",
    "Content-Length": JSON.stringify(loginData).length,
    "TOTP": config.TOTP
}

let loginRequest = https.request({
    hostname: baseAPIURL,
    path: "/api/userSessions",
    method: "POST",
    headers: loginHeaders
}, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        const loginResponse = JSON.parse(data);
        loggedInData.token = loginResponse.token;
        loggedInData.userId = loginResponse.userId;
        loggedInData.expiry = loginResponse.expiry;
        loggedInData.fullToken = `neos ${loginResponse.userId}:${loginResponse.token}`;
        if (res.statusCode === 200){
            console.log(`Successfully logged in!`);
            runAutoFriendAccept();
            runStatusUpdate();
            runSignalR();
        }
    });
});
loginRequest.write(JSON.stringify(loginData));
loginRequest.end();

// Every 90 seconds, update status
let statusUpdateData = {
    "onlineStatus": "Online",
    "lastStatusChange": "",
    "compatibilityHash": "mvcontactbot",
    "neosVersion": config.versionName,
    "outputDevice": "Unknown",
    "isMobile": false,
    "currentSessionHidden": false,
    "currentHosting": true,
    "currentSessionAccessLevel": 0
}

setInterval(runStatusUpdate, 90000);

// Every 2 minutes, accept all of the incoming friend requests.
setInterval(runAutoFriendAccept, 120000);

function GenerateRandomMachineId(){
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 12; i++){
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

function runAutoFriendAccept() {
    if (config.autoAcceptFriendRequests){
        console.log("Start auto accept friend requests.");
        let friendList = [];
        let friendRequest = https.request({
            hostname: baseAPIURL,
            path: `/api/users/${loggedInData.userId}/friends`,
            method: "GET",
            headers: {
                "Authorization": loggedInData.fullToken
            }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
    
            res.on('end', () => {
                JSON.parse(data).forEach(friend => {
                    if (friend.friendStatus == "Requested"){
                        friendList.push(friend);
                    }
                });
                friendList.forEach(friend => {
                    friend.friendStatus = "Accepted";
                    let updateFriends = https.request({
                        hostname: baseAPIURL,
                        path: `/api/users/${loggedInData.userId}/friends/${friend.id}`,
                        method: "PUT",
                        headers: {
                            "Authorization": loggedInData.fullToken,
                            "Content-Type": "application/json",
                            "Content-Length": JSON.stringify(friend).length
                        }
                    }, (res2) => {
                        let data = '';
                        res2.on('data', (chunk) => {
                            data += chunk;
                        });
                        res2.on('end', () => {
                            if (res2.statusCode == 200){
                                console.log(`Successfully added ${friend.id} as a contact!`);
                            }
                            else{
                                console.log(`Success HTTP ${res2.statusCode}: ${JSON.stringify(data)}`);
                            }
                        });
                        res2.on('error', (err) => {
                            console.log(`Error HTTP ${res2.statusCode}: ${JSON.stringify(err)}`);
                        });
                    });
                    updateFriends.write(JSON.stringify(friend));
                    updateFriends.end();
                });               
            });
        });
        friendRequest.end();
    }
}

function runStatusUpdate() {
    console.log("Start updating status");
    statusUpdateData.lastStatusChange = (new Date(Date.now())).toISOString();
    let updateStatus = https.request({
        hostname: baseAPIURL,
        path: `/api/users/${loggedInData.userId}/status`,
        method: "PUT",
        headers: {
            "Authorization": loggedInData.fullToken,
            "Content-Type": "application/json",
            "Content-Length": JSON.stringify(statusUpdateData).length
        }
    }, (res) => {
        let data = '';
        res.on('data', (chunk) => {
            data += chunk;
        });
        res.on('end', () => {
            if (res.statusCode != 200){
                console.error(data);
            }
            else {
                console.log("Status update successful!");
            }
        });
        
    });
    updateStatus.write(JSON.stringify(statusUpdateData));
    updateStatus.end();
}


function runSignalR() {
    //Connect to SignalR
    const signalRConnection = new signalR.HubConnectionBuilder()
        .withUrl("https://api.neos.com/hub", {
            headers: {
                "Authorization": loggedInData.fullToken,
                "UID": currentMachineID
            }
        })
        .withAutomaticReconnect()
        .configureLogging(signalR.LogLevel.Critical)
        .build()

    signalRConnection.start();

    //Actions whenever a message is received
    signalRConnection.on("ReceiveMessage", (message) => {
        console.log(`Received ${message.messageType} message from ${message.senderId}: ${message.content}`);
        let readMessageData = {
                "senderId": message.senderId,
                "readTime": (new Date(Date.now())).toISOString(),
                "ids": [
                    message.id
                ]
        }
        signalRConnection.send("MarkMessagesRead", readMessageData);
        if (message.messageType == "Text"){
            if (message.content.startsWith("/echo ")){
                let sendMessageData = {
                    "id": `MSG-${randomUUID()}`,
                    "senderId": loggedInData.userId,
                    "recipientId": message.senderId,
                    "messageType": "Text",
                    "sendTime": (new Date(Date.now())).toISOString(),
                    "lastUpdateTime": (new Date(Date.now())).toISOString(),
                    "content": message.content.slice(6)
                }
    
                signalRConnection.send("SendMessage", sendMessageData);
            }
        }
    });

    signalRConnection.on("MessageSent", (data) => {
        console.log(`Sent ${data.messageType} message to ${data.recipientId}: ${data.content}`);
    });
}