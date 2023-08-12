// Init project
const axios = require('axios');
const Discord = require("discord.js");

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
    ],
});

// Initialize channel and message objects
const channelMessagePairs = [
    { channelId: process.env.channelIdSquadShard, message: null },
    { channelId: process.env.channelIdFleetShard, message: null },
    { channelId: process.env.channelIdSquadPest, message: null },
    { channelId: process.env.channelIdFleetPest, message: null }
];

// Keeping the project "alive"
setInterval(() => {
    console.log(new Date().toISOString().replace("T", " ").substring(0, 19) + " Reinitializing the bot");
    main().catch(ex => console.error(ex.message));
}, process.env.timePeriod);

client.on("ready", async () => {
    client.user.setPresence({ activity: { name: "live payout countdowns", type: "WATCHING" } });

    // Initialize channel and message objects
    for (const pair of channelMessagePairs) {
        const writeChannel = await client.channels.fetch(pair.channelId);
        console.log(`Channel ${pair.channelId} fetched`);
        pair.message = await initializeMessageObject(writeChannel);
    }

    // Initial call
    await main();
});

client.login(process.env.botToken);

console.log("App restarted version 2.0.0");
console.log(process.env.url);

async function main() {
    try {
        for (const pair of channelMessagePairs) {
            if (!pair.message) {
                console.error(`Message object for channel ${pair.channelId} not initialized`);
                continue; // Skip this iteration and move to the next channel
            }

            const url = determineUrl(pair.channelId);
            if (!url) {
                console.error(`URL not found for channel ${pair.channelId}`);
                continue; // Skip this iteration and move to the next channel
            }

            const response = await axios.get(url);
            const matesData = parseData(response.data);

            if (matesData) {
                calculateSecondsUntilPayout(matesData);
                await sendMessage(matesData, pair.message); // Note: No need for 'writeChannel' argument

                console.log(`Message sent for channel: `, pair.channelId);
            } else {
                console.error(`Data not available for channel ${pair.channelId}`);
            }
        }
    } catch (error) {
        console.error("Error in main function:", error);
    }
}


async function initializeMessageObject(writeChannel) {
    console.log('Start initializing message object');
    try {
        const messages = await writeChannel.messages.fetch();

        if (messages.size === 0) {
            return await writeChannel.send({embed: new Discord.EmbedBuilder()});
        } else {
            if (messages.first().embeds.length === 0) {
                await messages.first().delete();
                return await writeChannel.send({embed: new Discord.EmbedBuilder()});
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
        const poHours = parseInt(user.UTC.substr(0, 2));
        const poMinutes = parseInt(user.UTC.substr(-2, user.UTC.length));
        const payout = parseInt(user.UTC.substr(0, 2) + user.UTC.substr(-2, user.UTC.length));

        mates.push({
            name: user.Name,
            payout: payout,
            po: {
                hours: poHours,
                minutes: poMinutes
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

        // Add this line to check if 'mate.po' exists before accessing 'hours'
        if (mate.po) {
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
        } else {
            console.log('calculateSecondsUntilPayout mate.po is undefined:', mate);
        }
    }

    mates.sort((a, b) => {
        return a.timeUntilPayout - b.timeUntilPayout;
    });
}

async function sendMessage(mates, message) {
    const embed = new EmbedBuilder().setThumbnail(process.env.thumbnail);
    const desc = '**Time until next payout**:';

    for (let i in mates) {
        let fieldName = "\n" + "------------------" + "\n" + "PO in " + String(mates[i].time) + " - (UTC " + String(mates[i].po.hours).padStart(2, '00') + ":" + String(mates[i].po.minutes).padStart(2, '00') + "):";
        let fieldText = '';
        for (const mate of mates[i].mates) {
            fieldText += `${mate.flag} [${mate.name}](${mate.swgoh})\n`; // Discord automatically trims messages
        }
        embed.addFields({name: fieldName, value: fieldText, inline: true});
    }

    embed.setDescription(desc);
    embed.setFooter({
        text: 'Last refresh',
        iconURL: process.env.thumbnail,
    });
    embed.setTimestamp();

    return await message.edit({ embeds: [embed] });
}


// Fetch data from appropriate URLs based on the channel ID
function determineUrl(channelId) {
    switch (channelId) {
        case process.env.channelIdSquadShard:
            return 'https://raw.githubusercontent.com/cr8or1/swgoh-po-bb8/main/po-squad-shard-data.json';
        case process.env.channelIdFleetShard:
            return 'https://raw.githubusercontent.com/cr8or1/swgoh-po-bb8/main/po-fleet-shard-data.json';
        case process.env.channelIdSquadPest:
            return 'https://raw.githubusercontent.com/cr8or1/swgoh-po-bb8/main/po-squad-pest-data.json';
        case process.env.channelIdFleetPest:
            return 'https://raw.githubusercontent.com/cr8or1/swgoh-po-bb8/main/po-fleet-pest-data.json';
        default:
            return '';
    }
}
