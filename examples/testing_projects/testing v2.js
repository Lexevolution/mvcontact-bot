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
        fetch(`https://api.resonite.com/users/${testBot.data.userId}/contacts`,
            {headers: {"Authorization": testBot.data.fullToken}}
        )
        .then(async res => {
            let stringBuilder = "";
            const friends = await res.json();
            friends.forEach(friend => {
                if (friend.contactStatus === "Accepted" && friend.isAccepted === true){
                    stringBuilder += `${friend.contactUsername} (${friend.id})\n`;
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

    if (message.startsWith("/removeContact ") && sendingUser === "U-Lexevo"){
        const friendId = message.split(' ')[1];
        testBot.removeFriend(friendId).then(() => {
            testBot.sendTextMessage(sendingUser, `Successfully removed ${friendId} from the bot's contacts!`);
        }).catch((err) => {
            testBot.sendTextMessage(sendingUser, `${err}`);
        });
    }

    if (message.startsWith("/addContact ") && sendingUser === "U-Lexevo"){
        const outUser = message.split(' ')[1];
        testBot.addFriend(outUser).then(() => {
            testBot.sendTextMessage(sendingUser, `Successfully requested ${outUser} to the bot's contacts!`);
        }).catch((err) => {
            testBot.sendTextMessage(sendingUser, `${err}`);
        });
    }
});

runBot();