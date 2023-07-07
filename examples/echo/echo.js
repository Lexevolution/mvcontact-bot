const {MVContactBot} = require('../../index');
const config = require('../config.json');

let echoBot = new MVContactBot(config);

async function runBot() {
    await echoBot.login()
        .catch(err => {
            console.error(err);
            process.exit();
        }
    );

    await echoBot.start()
        .catch(err => {
            console.error(err);
            process.exit();
        }
    );
}

echoBot.on('receiveTextMessage', (sendingUser, message) => {
    if (message.startsWith("/echo ")){
        echoBot.sendTextMessage(sendingUser, message.slice(6));
    }
});

runBot();