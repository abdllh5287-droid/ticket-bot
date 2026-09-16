const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder, 
    EmbedBuilder, 
    PermissionsBitField, 
    ChannelType, 
    REST, 
    Routes, 
    SlashCommandBuilder 
} = require('discord.js');
const express = require('express');

// سيرفر ويب خفيف للبقاء نشطاً 24/7 على Render
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is active and running 24/7!'));
app.listen(PORT, () => console.log(`[Express] Server is running on port ${PORT}`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// قراءة المتغيرات السرية من استضافة Render أماناً لك
const CONFIG = {
    TOKEN: process.env.TOKEN,
    CLIENT_ID: process.env.CLIENT_ID,
    SUPPORT_ROLE_ID: process.env.SUPPORT_ROLE_ID,
    LOG_CHANNEL_ID: process.env.LOG_CHANNEL_ID
};

// تسجيل أوامر السلاش مع خيار اختيار القسم مباشرة من دسكورد
const commands = [
    new SlashCommandBuilder()
        .setName('setup-tickets')
        .setDescription('إنشاء لوحة التذاكر في الروم الحالي')
        .addChannelOption(option =>
            option.setName('category')
                .setDescription('اختر القسم (Category) الذي ستفتح تحته التذاكر')
                .addChannelTypes(ChannelType.GuildCategory)
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(CONFIG.TOKEN);

client.once('ready', async () => {
    console.log(`[Bot Ready] متصل باسم: ${client.user.tag}`);
    try {
        await rest.put(Routes.applicationCommands(CONFIG.CLIENT_ID), { body: commands });
        console.log('[Slash Commands] تم تسجيل الأوامر بنجاح.');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!client.ticketCategories) client.ticketCategories = new Map();

    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'setup-tickets') {
            const selectedCategory = interaction.options.getChannel('category');
            client.ticketCategories.set(interaction.guildId, selectedCategory.id);

            const embed = new EmbedBuilder()
                .setTitle('🎫 نظام الدعم الفني والتذاكر المتقدم')
                .setDescription('تحتاج مساعدة أو لديك استفسار؟\nاختر نوع التذكرة من القائمة أدناه ليتم فتح روم خاص بك فوراً مع فريق الإدارة.')
                .setColor('#2b2d31')
                .setFooter({ text: 'مود الشرطة RP8 - نظام الدعم الفني' });

            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('ticket_select_menu')
                    .setPlaceholder('اضغط هنا لاختيار نوع التذكرة...')
                    .addOptions([
                        { label: 'دعم فني عام', description: 'لحل المشاكل والاستفسارات العامة', value: 'support', emoji: '🛠️' },
                        { label: 'شكاوى الإدارة أو الأعضاء', description: 'للتبليغ عن مخالفة أو مشكلة', value: 'report', emoji: '⚠️' },
                        { label: 'شحن / رتب / عروض', description: 'لاستفسارات الدعم والشحن', value: 'store', emoji: '💳' }
                    ])
            );

            await interaction.channel.send({ embeds: [embed], components: [row] });
            await interaction.reply({ content: `✅ تم إنشاء لوحة التذاكر بنجاح، وتحديد قسم **${selectedCategory.name}** لاستقبال التذاكر!`, ephemeral: true });
        }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select_menu') {
        const ticketType = interaction.values[0];
        const typeNames = { support: 'دعم-فني', report: 'شكوى', store: 'متجر' };
        const categoryId = client.ticketCategories.get(interaction.guildId);

        if (!categoryId) {
            return interaction.reply({ content: '❌ يجب على المسؤولين استخدام أمر `/setup-tickets` أولاً لتحديد قسم التذاكر!', ephemeral: true });
        }

        const channelName = `ticket-${typeNames[ticketType]}-${interaction.user.username}`.toLowerCase();
        
        const existingChannel = interaction.guild.channels.cache.find(c => c.name === channelName);
        if (existingChannel) {
            return interaction.reply({ content: `❌ لديك تذكرة مفتوحة من نفس النوع مسبقاً: ${existingChannel}`, ephemeral: true });
        }

        const ticketChannel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: categoryId,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                { id: CONFIG.SUPPORT_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
            ]
        });

        const welcomeEmbed = new EmbedBuilder()
            .setTitle(`🎫 تذكرة جديدة: ${typeNames[ticketType]}`)
            .setDescription(`مرحباً بك ${interaction.user}!\nيرجى شرح مشكلتك بالتفصيل وسيقوم فريق الإدارة (<@&${CONFIG.SUPPORT_ROLE_ID}>) بالرد عليك قريباً.`)
            .setColor('#00ffcc');

        const controlRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('claim_ticket').setLabel('استلام التذكرة').setStyle(ButtonStyle.Success).setEmoji('🙋‍♂️'),
            new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق التذكرة').setStyle(ButtonStyle.Danger).setEmoji('🔒')
        );

        await ticketChannel.send({ content: `${interaction.user} | <@&${CONFIG.SUPPORT_ROLE_ID}>`, embeds: [welcomeEmbed], components: [controlRow] });
        await interaction.reply({ content: `✅ تم إنشاء تذكرتك بنجاح: ${ticketChannel}`, ephemeral: true });
    }

    if (interaction.isButton()) {
        if (interaction.customId === 'claim_ticket') {
            if (!interaction.member.roles.cache.has(CONFIG.SUPPORT_ROLE_ID)) {
                return interaction.reply({ content: '❌ هذا الزر مخصص للإدارة فقط!', ephemeral: true });
            }
            
            const claimedEmbed = new EmbedBuilder()
                .setDescription(`🙋‍♂️ تم استلام هذه التذكرة بواسطة الإداري: ${interaction.user}`)
                .setColor('#ffff00');
            
            await interaction.channel.send({ embeds: [claimedEmbed] });
            
            const updatedRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('claimed_status').setLabel(`مستلمة بواسطة ${interaction.user.username}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق التذكرة').setStyle(ButtonStyle.Danger).setEmoji('🔒')
            );
            await interaction.update({ components: [updatedRow] });
        }

        if (interaction.customId === 'close_ticket') {
            await interaction.reply('🔒 جاري إغلاق التذكرة وحفظ السجل...');

            const logChannel = interaction.guild.channels.cache.get(CONFIG.LOG_CHANNEL_ID);
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle('🔒 إغلاق تذكرة دعم فني')
                    .setDescription(`اسم الروم: **${interaction.channel.name}**\nبواسطة: ${interaction.user}`)
                    .setColor('#ff0000')
                    .setTimestamp();
                await logChannel.send({ embeds: [logEmbed] });
            }

            setTimeout(async () => {
                try {
                    await interaction.channel.delete();
                } catch (e) {
                    console.log('خطأ في الحذف');
                }
            }, 3000);
        }
    }
});

client.login(CONFIG.TOKEN);