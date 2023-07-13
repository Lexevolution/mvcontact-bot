//const fs = require("fs");

function botLog(bot, filepath, type, message){
    let botName = bot.config.username;
    let time = new Date(Date.now()).toISOString();
    if (type !== "ERROR"){
        console.log(`[${time} | ${type}] ${botName}: ${message}`);
    }
    else {
        console.error(`[${time} | ${type}] ${botName}: ${message}`);
    }
}

module.exports = {botLog};