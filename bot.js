// Init project
const Discord = require("discord.js");
const fs = require("fs");

const client = new Discord.Client();

// Channel discord id 1 (squad arena)

var writeChannelSquadShard;
var writeChannelFleetShard;
var writeChannelSquadPest;
var writeChannelFleetPest;
var messageSquadShard;
var messageFleetShard;
var messageSquadPest;
var messageFleetPest;

// Parse a JSON data file
const matesSquadShardData = parseData(JSON.parse(fs.readFileSync("./po-squad-shard-data.json", "utf8")));
const matesFleetShardData = parseData(JSON.parse(fs.readFileSync("./po-fleet-shard-data.json", "utf8")));
const matesSquadPestData = parseData(JSON.parse(fs.readFileSync("./po-squad-pest-data.json", "utf8")));
const matesFleetPestData = parseData(JSON.parse(fs.readFileSync("./po-fleet-pest-data.json", "utf8")));

// Keeping the project "alive"
setInterval(() => {
	console.log(new Date().toISOString().replace("T", " ").substring(0, 19) + " Reinitializing the bot");
	main().catch(ex => console.error(ex.message));
}, process.env.timePeriod);


// Initialize the bot
client.on("ready", async () => {
    client.user.setPresence({game: {name: "live payout countdowns", type: 0}});
    writeChannelSquadShard = await client.channels.fetch(process.env.channelIdSquadShard);
    writeChannelFleetShard = await client.channels.fetch(process.env.channelIdFleetShard);
    writeChannelSquadPest = await client.channels.fetch(process.env.channelIdSquadPest);
    writeChannelFleetPest = await client.channels.fetch(process.env.channelIdFleetPest);

    // Initial call
    await main();
});
client.login(process.env.botToken);

console.log("App restarted version 1.0.0");
console.log(process.env.url);

async function main() {
    if (!messageSquadShard) {
        messageSquadShard = await initializeMessageObject(writeChannelSquadShard);
    }
    if (!messageFleetShard) {
        messageFleetShard = await initializeMessageObject(writeChannelFleetShard);
    }
    if (!messageSquadPest) {
        messageSquadPest = await initializeMessageObject(writeChannelSquadPest);
    }
    if (!messageFleetPest) {
        messageFleetPest = await initializeMessageObject(writeChannelFleetPest);
    }

    if (messageSquadShard) {
        await sendToChannel(matesSquadShardData, writeChannelSquadShard, messageSquadShard);
    } else {
        console.error("Shard message object not initialized");
    }

    if (messageFleetShard) {
        await sendToChannel(matesFleetShardData, writeChannelFleetShard, messageFleetShard);
    } else {
        console.error("Shard message object not initialized");
    }

    if (messageSquadPest) {
        await sendToChannel(matesSquadPestData, writeChannelSquadPest, messageSquadPest);
    } else {
        console.error("Pest message object not initialized");
    }

    if (messageFleetPest) {
        await sendToChannel(matesFleetPestData, writeChannelFleetPest, messageFleetPest);
    } else {
        console.error("Pest message object not initialized");
    }
}

// Below are the rest of the functions that make up the bot
async function sendToChannel(mates, writeChannel, message) {
    try {
        calculateSecondsUntilPayout(mates);
        await sendMessage(mates, message);
    } catch (err) {
        console.log(err);
    }
}

async function initializeMessageObject(writeChannel) {
    // fetch message, create a new one if necessary
    console.log('Start initializing message object');
    try {
        const messages = await writeChannel.messages.fetch();

        if (messages.array().length === 0) {
            return await writeChannel.send({embed: new Discord.MessageEmbed()});
        } else {
            if (messages.first().embeds.length === 0) {
                await messages.first().delete();
                return await writeChannel.send({embed: new Discord.MessageEmbed()});
            } else {
                return messages.first();
            }
        }
    } catch (err) {
        console.log(err);
        return undefined;
    } finally {
        console.log('Finished initializing message object');
    }
}

function parseData(shardData) {
    const mates = [];

    for (let i in shardData) {
        const user = shardData[i];
        mates.push({
            name: user.Name,
            payout: parseInt(user.UTC.substr(0, 2) + user.UTC.substr(-2, user.UTC.length)),
            po: {
                hours: parseInt(user.UTC.substr(0, 2)),
                minutes: parseInt(user.UTC.substr(-2, user.UTC.length))
            },
            flag: user.Flag,
            swgoh: user.SWGOH,
            utc: user.UTC
        });
    }

    const matesByTime = {};
    for (let i in mates) {
        const mate = mates[i];
        if (!matesByTime[mate.payout]) {
            matesByTime[mate.payout] = {
                payout: mate.payout,
                mates: [],
                po: mate.po
            }
        }
        matesByTime[mate.payout].mates.push(mate);
    }
    return Object.values(matesByTime);
}

function calculateSecondsUntilPayout(mates) {
    const now = new Date();
    for (let i in mates) {
        const mate = mates[i];
        const p = new Date();
        p.setUTCHours(mate.po.hours, mate.po.minutes, 0, 0);
        if (p < now) p.setDate(p.getDate() + 1);
        mate.timeUntilPayout = p.getTime() - now.getTime();
        let dif = new Date(mate.timeUntilPayout);
        const round = dif.getTime() % 60000;
        if (round < 30000) {
            dif.setTime(dif.getTime() - round);
        } else {
            dif.setTime(dif.getTime() + 60000 - round);
        }
        mate.time = `${String(dif.getUTCHours()).padStart(2, '00')}:${String(dif.getUTCMinutes()).padStart(2, '00')}`;
    }

    mates.sort((a, b) => {
        return a.timeUntilPayout - b.timeUntilPayout;
    })
}

async function sendMessage(mates, message) {
    let embed = new Discord.MessageEmbed().setThumbnail(process.env.thumbnail);
    let desc = '**Time until next payout**:';
    for (let i in mates) {
        let fieldName = "\n" + "------------------" + "\n" + "PO in " + String(mates[i].time) + " - (UTC " + String(mates[i].po.hours).padStart(2, '00') + ":" + String(mates[i].po.minutes).padStart(2, '00') + "):";
        let fieldText = '';
        for (const mate of mates[i].mates) {
            fieldText += `${mate.flag} [${mate.name}](${mate.swgoh})\n`; // Discord automatically trims messages
        }
        embed.addField(fieldName, fieldText, true);
    }
    embed.setDescription(desc);
    embed.setFooter('Last refresh', process.env.thumbnail);
    embed.setTimestamp();
    await message.edit({embed});
    console.log('Message send');
}