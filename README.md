# mvcontact-bot
A chat bot module that currently works with NeosVR. This allows you to create your own chat bots.

## Usage
(There are usage examples in the [examples](./examples) folder)
- Include the module in your code
- Set up your config (explained below)
- Create a new instance of the `MVContactBot`, with the config as the parameter (you can have multiple bots):
```js
let myBot = new MVContactBot(config);
```
- Make the bot login and start it up afterwards:
```js
async function runBot() {
    await myBot.login()
        .catch(err => {console.error(err);}
    );

    await myBot.start()
        .catch(err => {console.error(err);}
    );
}

runBot();
```
- The bot will emit events on messages, so listen to any of these events (explanation for each of these events and the data returned below)
    - `receiveRawMessage`
    - `receiveTextMessage`
    - `receiveSoundMessage`
    - `receiveObjectMessage`
    - `receiveSessionInviteMessage`
```js
myBot.on('receiveTextMessage', (sendingUser, message) => {
    ...
});
```
- You can also send messages (further explained below)
    - `sendRawMessage(messageData)`
    - `sendTextMessage(user, message)`

## Config Schema
The config used for the constructor of the `MVContactBot` is an object and has a few parameters, many of which are optional and have defaults:
- `username` (required, string): The NeosVR account username that the bot will use.
- `password` (required, string): The NeosVR account password that the bot will use.
- `TOTP` (optional, string): If the NeosVR account has TOTP enabled for login, supply the 6 digit code here.
- `autoAcceptFriendRequests` (optional, bool, default: `true`): If true, will automatically accept any incoming contact requests to the associated Neos account.
- `autoExtendLogin` (optional, bool, default: `true`): If true, will keep extending the login session of the associated Neos account, so it doesn't automatically logout.
- `updateStatus` (optional, bool, default: `true`): If true, will make the associated Neos account show as Online and will display the version name from the `versionName` parameter. If using this bot on the same Neos account as a Neos headless client, it is recommended to set this to `false`.
- `readMessagesOnReceive` (optional, bool, default: `true`): If true, will automatically mark all messages that it receives as read. This is useful to indicate to a user if a bot is receiving their message.
- `versionName` (optional, string, default: `"Neos Contact Bot"`): When `updateStatus` is `true`, will display this as the version used. This can be programatically changed on the fly.

## Sending Messages
These are the current methods provided to send messages:
- `sendTextMessage(user, message)`
    - `user` (string): The Neos User ID that the message will be sent to.
    - `message` (string): The text message that will be sent.
```js
# Example
myBot.sendTextMessage("U-Lexevo", "Hello there!");
```
- `sendRawMessage(messageData)`
    - `messageData` (object): A Neos message object to be sent. More info on the schema of the message object [here](./docs/Message.md).

## Receiving Messages
These are the details for the events that get emitted when a message is received.
- `receiveRawMessage`: This event gets emitted on all received messages, even ones that aren't categorised by this bot.
    - `messageData` (object): A Neos [message object](./docs/Message.md).
```js
myBot.on('receiveRawMessage', (messageData) => {
    ...
});
```
- `receiveTextMessage`: This event gets emitted when a text message is received.
    - `senderId` (string): The Neos user ID of the user who sent the text message.
    - `content` (string): The text message itself.
```js
myBot.on('receiveTextMessage', (senderId, content) => {
    ...
});
```
- `receiveSoundMessage`: This event gets emitted whenever an audio message is received.
    - `senderId` (string): The Neos user ID of the user who sent the audio message.
    - `audioUrl` (string): The url which points to the audio from the audio message.
```js
myBot.on('receiveSoundMessage', (senderId, audioUrl) => {
    ...
});
```
- `receiveObjectMessage`: This event gets emitted whenever an object/item is received.
    - `senderId` (string): The Neos user ID of the user who sent the object.
    - `name` (string): The name of the object that was sent.
    - `objectAssetUrl` (string): The url which points to the asset of the object. If you need more info from the object (e.g. tags), use `receiveRawMessage`.
```js
myBot.on('receiveObjectMessage', (senderId, name, objectAssetUrl) => {
    ...
});
```
- `receiveSessionInviteMessage`: This event gets emitted whenever a session invite from a user is received.
    - `senderId` (string): The Neos user ID of the user who sent the session invite.
    - `name` (string): The name of the session associated with the invite.
    - `sessionId` (string): The ID of the session associated with the invite.
```js
myBot.on('receiveSessionInviteMessage', (senderId, name, sessionId) => {
    ...
});
```