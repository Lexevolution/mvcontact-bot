/* This is a test project that I was experimenting with to figure out how things would work with the bot.
You can take this as another example if you need, but it's not neat at all.
*/
const {MVContactBot} = require('./index');
const config = require('./examples/config.json');
const fs = require('fs');
const https = require('https');
const { exec } = require("child_process");

const loginConfig = {
    "username": config.username,
    "password": config.password,
    "versionName": config.versionName
}
let test = new MVContactBot(loginConfig);
async function runBot() {
    await test.login()
        .catch(err => {
            console.error(err);
            process.exit();
        }
    );

    await test.start()
        .catch(err => {
            console.error(err);
            process.exit();
        }
    );
}

test.on('receiveTextMessage', (sendingUser, message) => {
    if (message.startsWith("/echo ")){
        test.sendTextMessage(sendingUser, message.slice(6));
    }
    else if (message.startsWith("/msg ")){
        if (sendingUser === "U-Lexevo"){
            const outUser = message.split(' ')[1];
            const outMsg = message.split(' ').slice(2).join(' ');
            test.sendTextMessage(outUser, outMsg);
            test.sendTextMessage(sendingUser, `Sent message to ${outUser}!`);
        }
        else {
            test.sendTextMessage(sendingUser, "You are not authorised to use this command.");
        }
    }
    else {
        test.sendTextMessage(sendingUser, "Command not recognised.");
    }
});

test.on('receiveSoundMessage', (sendingUser, audioURL) => {
    const audioHash = audioURL.slice(36);
    console.log(audioHash);
    test.sendTextMessage(sendingUser, "Listening to audio message...");

    https.get(audioURL, res => {
        const file = fs.createWriteStream(`D:\\Programs\\whisper-fast\\Input\\${audioHash}.ogg`);
        res.pipe(file);

        file.on('finish', () => {
            file.close();

            const whisper_ai = exec(`"D:\\Programs\\whisper-fast\\Scripts\\python.exe" "D:\\Programs\\whisper-fast\\test.py" ${audioHash}`, (error, stdout, stderr) => {
                if (error) {
                    console.error(`exec error: ${error}`);
                    test.sendTextMessage(sendingUser, "error");
                    return;
                }
                fs.readFile(`D:\\Programs\\whisper-fast\\Output\\${audioHash}.txt`, (err, data) => {
                    if (err) {
                        console.error(`readFile error: ${err}`);
                        test.sendTextMessage(sendingUser, "error");
                        return;
                    }
                    test.sendTextMessage(sendingUser, data.toString());
                });
            });
        });

    });
    console.log(`Audio message: ${audioURL}`);
});

runBot();