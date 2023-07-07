# Message Object Schema
This is mainly used in this project for the `sendRawMessage` function.

The message object consists of these properties:
- `id` (string, required): a type 4 (random) UUID that is prepended with `MSG-`
- `senderId` (string, required): The user ID of the sender. It needs to be the same as the authenticated user who is sending the message.
- `recipientId` (string, required): The recipient's User ID.
- `messageType` (enum string, required): Can be `"Text"`, `"Object"`, `"Sound"`, `"SessionInvite"`, `"CreditTransfer"` or `"SugarCubes"`.
- `sendTime` (ISO time formatted string, required): The time that the message is sent, in ISO 8601 format. This is required to be within a couple seconds of the message being sent, so it's highly recommended you use the `Date.now()` function.
- `lastUpdateTime` (ISO time formatted string, required): Same properties as `sendTime`, except it tracks when the message was last updated.
- `content` (various, optional): Can be of type string for the `Text` message type, and a specific object for all other types.