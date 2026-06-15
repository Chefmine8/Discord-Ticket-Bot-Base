module.exports = {
    token: "TON_TOKEN_BOT_ICI",
    guildId: "ID_DE_TON_SERVEUR",
    archiveChannelId: "ID_DU_SALON_ARCHIVES",

    // Le préfixe pour les commandes staff (!r, !close, etc.)
    prefix: "!",

    categories: {
        Support: {
            categoryId: "ID_CATEGORIE_SUPPORT",
            roleId: "ID_ROLE_SUPPORT",
            emoji: "<:support:123456789012345678>" // Remplace par ton emoji custom
        },
        Plainte: {
            categoryId: "ID_CATEGORIE_PLAINTE",
            roleId: "ID_ROLE_PLAINTE",
            emoji: "⚖️" // Tu peux aussi utiliser de simples emojis unicode
        },
        Partenariat: {
            categoryId: "ID_CATEGORIE_PARTENARIAT",
            roleId: "ID_ROLE_PARTENARIAT",
            emoji: "🤝"
        }
    }
};
