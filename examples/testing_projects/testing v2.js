const {MVContactBot} = require('../../index');
const config = require('../config.json');

let testBot = new MVContactBot(config);

async function runBot() {
    await testBot.login()
        .catch(err => {
            console.error(err);
            process.exit();
        }
    );

    await testBot.start()
        .catch(err => {
            console.error(err);
            process.exit();
        }
    );
}

testBot.on('receiveTextMessage', (sendingUser, message) => {
    if (message.startsWith("/echo ")){
        testBot.sendTextMessage(sendingUser, message.slice(6));
    }

    if (message === "/listContacts" && sendingUser === "U-Lexevo"){
        fetch(`https://api.neos.com/api/users/${testBot.data.userId}/friends`,
            {headers: {"Authorization": testBot.data.fullToken}}
        )
        .then(async res => {
            let stringBuilder = "";
            const friends = await res.json();
            friends.forEach(friend => {
                if (friend.friendStatus === "Accepted" && friend.isAccepted === true){
                    stringBuilder += `${friend.id}\n`;
                }
            });
            testBot.sendTextMessage(sendingUser,stringBuilder.trim());
        });
    }

    //Cannot message non-contacts.
    if (message.startsWith("/msg ") && sendingUser === "U-Lexevo"){
        const outUser = message.split(' ')[1];
        const outMsg = message.split(' ').slice(2).join(' ');
        testBot.sendTextMessage(outUser, outMsg);
        testBot.sendTextMessage(sendingUser, `Sent message to ${outUser}!`);
    }
});

runBot();