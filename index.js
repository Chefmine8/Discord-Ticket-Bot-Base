const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const config = require('./config.js');
const { generateTranscript } = require('./utils/transcript.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel, Partials.Message]
});

// Fonctions pour gérer la BDD JSON
const getTickets = () => {
    if (!fs.existsSync('./tickets.json')) {
        fs.writeFileSync('./tickets.json', '{}');
    }
    return JSON.parse(fs.readFileSync('./tickets.json', 'utf8'));
};
const saveTickets = (data) => fs.writeFileSync('./tickets.json', JSON.stringify(data, null, 2));

client.once('ready', () => {
    console.log(`✅ Connecté en tant que ${client.user.tag}`);
});

// GESTION DES MESSAGES (DMs et Commandes Staff)
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    let tickets = getTickets();
    let ticketData = tickets[message.author.id];

    // === CAS 1 : L'utilisateur parle en DM ===
    if (!message.guild) {
        if (!ticketData) {
            // Aucun ticket ouvert -> On propose le menu
            const options = Object.keys(config.categories).map(cat => {
                const isCustomEmoji = config.categories[cat].emoji.startsWith('<:');
                const emojiData = isCustomEmoji 
                    ? { id: config.categories[cat].emoji.match(/:(\d+)>/)[1] } 
                    : { name: config.categories[cat].emoji };

                return { label: cat, value: cat, emoji: emojiData };
            });

            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_category')
                    .setPlaceholder('Sélectionnez une catégorie de ticket')
                    .addOptions(options)
            );

            return message.reply({ content: "Bonjour ! Pour ouvrir un ticket, veuillez choisir une catégorie ci-dessous :", components: [row] });
        } else {
            // Ticket existant -> Relais du message vers le salon serveur
            const guild = client.guilds.cache.get(config.guildId);
            if (!guild) return;
            const channel = guild.channels.cache.get(ticketData.channelId);
            if (!channel) return; // Erreur sécurité

            let files = [];
            if (message.attachments.size > 0) files = message.attachments.map(a => a.url);

            await channel.send({ content: `**[CLIENT]** ${message.content}`, files: files });
        }
        return;
    }

    // === CAS 2 : Le Staff utilise des commandes dans le salon ===
    if (message.guild && message.content.startsWith(config.prefix)) {
        const args = message.content.slice(config.prefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        // Trouver à qui appartient ce ticket
        const userId = Object.keys(tickets).find(key => tickets[key].channelId === message.channel.id);

        if (command === 'r' && userId) {
            const replyContent = args.join(' ');
            if (!replyContent && message.attachments.size === 0) return message.reply("Veuillez fournir un message à envoyer.");

            const user = await client.users.fetch(userId).catch(() => null);
            if (!user) return message.reply("Impossible de trouver l'utilisateur.");

            let files = [];
            if (message.attachments.size > 0) files = message.attachments.map(a => a.url);

            // Envoi en DM
            await user.send({ content: `**[${tickets[userId].category}]** ${replyContent}`, files: files }).catch(() => {
                return message.reply("❌ Impossible d'envoyer un DM à cet utilisateur (DMs fermés).");
            });

            await message.react('✅');
        }

        if (command === 'rename' && userId) {
            const newName = args.join('-');
            if (!newName) return message.reply("Veuillez indiquer un nouveau nom.");
            await message.channel.setName(newName);
            await message.reply(`✅ Salon renommé en \`${newName}\`.`);
        }

        if (command === 'info' && userId) {
            const embed = new EmbedBuilder()
                .setTitle("ℹ️ Informations du Ticket")
                .addFields(
                    { name: 'Propriétaire', value: `<@${userId}> (${userId})` },
                    { name: 'Catégorie', value: tickets[userId].category },
                    { name: 'Ouvert le', value: `<t:${Math.floor(tickets[userId].openedAt / 1000)}:F>` }
                )
                .setColor('#2b2d31');
            await message.reply({ embeds: [embed] });
        }

        if (command === 'close' && userId) {
            await closeTicket(message.channel, userId, message.author, tickets);
        }
        
        // !open @user Categorie
        if (command === 'open') {
            const targetUser = message.mentions.users.first() || await client.users.fetch(args[0]).catch(() => null);
            const categoryName = args[1];

            if (!targetUser || !config.categories[categoryName]) {
                return message.reply(`Usage: \`${config.prefix}open @user Catégorie\``);
            }

            if (tickets[targetUser.id]) return message.reply("Cet utilisateur a déjà un ticket d'ouvert.");

            await createTicketChannel(targetUser, categoryName, message.author);
            message.reply(`✅ Ticket ouvert pour ${targetUser.username}.`);
        }
    }
});

// GESTION DES INTERACTIONS (Menu déroulant et Boutons)
client.on('interactionCreate', async interaction => {
    let tickets = getTickets();

    // L'utilisateur choisit une catégorie dans ses DMs
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_category') {
        const categoryName = interaction.values[0];
        
        if (tickets[interaction.user.id]) {
            return interaction.reply({ content: "❌ Vous avez déjà un ticket d'ouvert.", ephemeral: true });
        }

        await interaction.update({ content: "Création de votre ticket en cours...", components: [] });
        await createTicketChannel(interaction.user, categoryName, null);
    }

    // Le staff clique sur le bouton 🔒 Fermer
    if (interaction.isButton() && interaction.customId === 'close_ticket') {
        const userId = Object.keys(tickets).find(key => tickets[key].channelId === interaction.channel.id);
        if (!userId) return interaction.reply({ content: "Ce salon n'est pas un ticket actif.", ephemeral: true });

        await interaction.reply("🔒 Fermeture du ticket en cours...");
        await closeTicket(interaction.channel, userId, interaction.user, tickets);
    }
});

// --- FONCTIONS UTILITAIRES ---

async function createTicketChannel(user, categoryName, staffOpener = null) {
    const guild = client.guilds.cache.get(config.guildId);
    const categoryConfig = config.categories[categoryName];

    // Création du salon sur le serveur
    const channel = await guild.channels.create({
        name: `ticket-${user.username}`,
        type: ChannelType.GuildText,
        parent: categoryConfig.categoryId,
        permissionOverwrites: [
            {
                id: guild.roles.everyone.id,
                deny: [PermissionsBitField.Flags.ViewChannel],
            },
            {
                id: categoryConfig.roleId, // Rôle staff spécifique à la catégorie
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
            },
            {
                id: client.user.id, // On donne explicitement l'accès au bot
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels],
            }
        ],
    });

    // Sauvegarde dans la DB
    let tickets = getTickets();
    tickets[user.id] = { channelId: channel.id, category: categoryName, openedAt: Date.now() };
    saveTickets(tickets);

    // Embed d'ouverture dans le salon serveur
    const embed = new EmbedBuilder()
        .setTitle(`Ticket — ${categoryName}`)
        .setDescription(`**Membre :** <@${user.id}> (${user.id})\n**Pôle :** ${categoryConfig.emoji} ${categoryName}\n\nBonjour <@${user.id}>, votre ticket a bien été ouvert.\nUn membre du staff vous répondra dès que possible.`)
        .setColor('#2b2d31');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Fermer le ticket').setEmoji('🔒').setStyle(ButtonStyle.Secondary)
    );

    await channel.send({ content: `<@&${categoryConfig.roleId}> — nouveau ticket ouvert.`, embeds: [embed], components: [row] });

    // Notifier l'utilisateur en DM
    const dmMsg = staffOpener 
        ? `L'équipe **${categoryName}** a ouvert un ticket avec vous.` 
        : `Votre ticket dans la catégorie **${categoryName}** a été créé. Un membre du staff va vous répondre.`;
    
    await user.send(`✅ ${dmMsg}`).catch(()=>null);
}

async function closeTicket(channel, userId, closedBy, tickets) {
    const guild = client.guilds.cache.get(config.guildId);
    const archiveChannel = guild.channels.cache.get(config.archiveChannelId);

    // Générer l'archive textuelle
    const transcriptText = await generateTranscript(channel);
    const buffer = Buffer.from(transcriptText, 'utf-8');
    const attachment = new AttachmentBuilder(buffer, { name: `transcript-${channel.name}.txt` });

    // Créer l'embed d'archive
    const embedArchive = new EmbedBuilder()
        .setTitle('🔒 Ticket Fermé')
        .addFields(
            { name: 'Utilisateur', value: `<@${userId}>`, inline: true },
            { name: 'Fermé par', value: `<@${closedBy.id}>`, inline: true },
            { name: 'Catégorie', value: tickets[userId].category, inline: true }
        )
        .setColor('Red')
        .setTimestamp();

    if (archiveChannel) {
        await archiveChannel.send({ embeds: [embedArchive], files: [attachment] });
    }

    // Avertir l'utilisateur
    const user = await client.users.fetch(userId).catch(() => null);
    if (user) {
        await user.send(`🔒 Votre ticket **${tickets[userId].category}** a été fermé par le staff.`).catch(()=>null);
    }

    // Nettoyer JSON et supprimer le salon
    delete tickets[userId];
    saveTickets(tickets);
    
    setTimeout(() => {
        channel.delete().catch(()=>null);
    }, 3000); // Délai de 3 secondes pour laisser le bot finir ses actions
}

client.login(config.token);
