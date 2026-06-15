const { Collection } = require('discord.js');

async function generateTranscript(channel) {
    let messages = [];
    let lastId;

    // Récupère jusqu'à 1000 messages
    while (true) {
        const options = { limit: 100 };
        if (lastId) options.before = lastId;

        const fetched = await channel.messages.fetch(options);
        messages.push(...fetched.values());
        
        if (fetched.size !== 100) break;
        lastId = fetched.last().id;
    }

    messages.reverse(); // Ordre chronologique

    let transcript = `=== TICKET ARCHIVE : ${channel.name} ===\nDate: ${new Date().toLocaleString('fr-FR')}\n\n`;

    messages.forEach(msg => {
        if (msg.author.bot && msg.embeds.length > 0) return; // Ignore les embeds du bot
        
        const time = new Date(msg.createdTimestamp).toLocaleTimeString('fr-FR');
        const author = msg.author.bot ? "BOT / STAFF" : msg.author.username;
        transcript += `[${time}] ${author}: ${msg.content}\n`;
        
        if (msg.attachments.size > 0) {
            transcript += `[Pièces jointes] ${msg.attachments.map(a => a.url).join(', ')}\n`;
        }
    });

    return transcript;
}

module.exports = { generateTranscript };
