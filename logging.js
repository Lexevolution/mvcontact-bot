const fs = require("fs/promises");
const path = require("path");

class botLog {
    constructor(name, toFile, filepath){
        this.name = name;
        this.toFile = toFile;
        if (toFile){
            const absolutePath = path.resolve(__dirname, filepath);
            fs.access(absolutePath).then(() =>{
                fs.stat(absolutePath).then((pathStats) => {
                    if (pathStats.isDirectory()){
                        this.filepath = filepath + `/${name} - ${SafeWindowsFilename()}.log`;
                    }
                    else {
                        this.filepath = filepath;
                    }
                });
            })
            .catch((err) => {
                throw new Error("Logging file/directory doesn't exist!");
            });
        }
        
    }

    async log(type, message){
        let time = new Date(Date.now()).toISOString();
        if (type !== "ERROR"){
            console.log(`[${time} | ${type}] ${this.name}: ${message}`);
        }
        else {
            console.error(`[${time} | ${type}] ${this.name}: ${message}`);
        }

        if (this.toFile){
            await fs.writeFile(this.filepath, `[${time} | ${type}] ${this.name}: ${message}\n`, {flag: "a"});
        }
    }
}

function SafeWindowsFilename(){
    return new Date(Date.now()).toISOString().replace(/:/g, "-").replace("T", "_").slice(0,19);
}
module.exports = {botLog};