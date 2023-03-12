setTimeout(() => {
    signalRConnection.send("SendMessage", {
        "id": `MSG-${randomUUID()}`,
        "senderId": loggedInData.userId,
        "recipientId": "",
        "messageType": "Text",
        "sendTime": (new Date(Date.now())).toISOString(),
        "lastUpdateTime": (new Date(Date.now())).toISOString(),
        "content": "👋"
    });
}, 5000);