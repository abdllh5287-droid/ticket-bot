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

// تخزين إعدادات كل سيرفر مؤقتاً
const serverConfigs = new Map();

client.once('ready', async () => {
    console.log(`[Bot Ready] متصل باسم: ${client.user.tag}`);

    // تسجيل الأوامر تلقائياً باستخدام التوكن فقط (بدون الحاجة لـ Client ID خارجي)
    const commands = [
        new SlashCommandBuilder()
            .setName('setup')
            .setDescription('إعداد نظام التذاكر بالكامل (القسم، رتبة الدعم، روم السجلات)')
            .addChannelOption(option =>
                option.setName('category')
                    .setDescription('اختر القسم (Category) الذي ستفتح تحته التذاكر')
                    .addChannelTypes(ChannelType.GuildCategory)
                    .setRequired(true))
            .addRoleOption(option =>
                option.setName('support_role')
                    .setDescription('اختر رتبة الإدارة أو الدعم الفني المسؤول عن التذاكر')
                    .setRequired(true))
            .addChannelOption(option =>
                option.setName('log_channel')
                    .setDescription('اختر روم السجلات (Logs) لإغلاق التذاكر')
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(true))
            .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

    try {
        console.log('[Slash Commands] جاري تسجيل أوامر السلاش...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('[Slash Commands] تم تسجيل أمر /setup بنجاح في دسكورد!');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'setup') {
            const selectedCategory = interaction.options.getChannel('category');
            const selectedRole = interaction.options.getRole('support_role');
            const selectedLogChannel = interaction.options.getChannel('log_channel');

            serverConfigs.set(interaction.guildId, {
                categoryId: selectedCategory.id,
                supportRoleId: selectedRole.id,
                logChannelId: selectedLogChannel.id
            });

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
            await interaction.reply({ 
                content: `✅ تم حفظ الإعدادات بنجاح:\n📁 القسم: **${selectedCategory.name}**\n🛡️ رتبة الدعم: **${selectedRole.name}**\n📜 روم اللوغ: **${selectedLogChannel.name}**`, 
                ephemeral: true 
            });
        }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select_menu') {
        const config = serverConfigs.get(interaction.guildId);
        if (!config) {
            return interaction.reply({ content: '❌ يجب على المسؤولين إعداد البوت أولاً باستخدام أمر `/setup`!', ephemeral: true });
        }

        const ticketType = interaction.values[0];
        const typeNames = { support: 'دعم-فني', report: 'شكوى', store: 'متجر' };
        const channelName = `ticket-${typeNames[ticketType]}-${interaction.user.username}`.toLowerCase();
        
        const existingChannel = interaction.guild.channels.cache.find(c => c.name === channelName);
        if (existingChannel) {
            return interaction.reply({ content: `❌ لديك تذكرة مفتوحة من نفس النوع مسبقاً: ${existingChannel}`, ephemeral: true });
        }

        const ticketChannel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: config.categoryId,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                { id: config.supportRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
            ]
        });

        const welcomeEmbed = new EmbedBuilder()
            .setTitle(`🎫 تذكرة جديدة: ${typeNames[ticketType]}`)
            .setDescription(`مرحباً بك ${interaction.user}!\nيرجى شرح مشكلتك بالتفصيل وسيقوم فريق الإدارة (<@&${config.supportRoleId}>) بالرد عليك قريباً.`)
            .setColor('#00ffcc');

        const controlRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('claim_ticket').setLabel('استلام التذكرة').setStyle(ButtonStyle.Success).setEmoji('🙋‍♂️'),
            new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق التذكرة').setStyle(ButtonStyle.Danger).setEmoji('🔒')
        );

        await ticketChannel.send({ content: `${interaction.user} | <@&${config.supportRoleId}>`, embeds: [welcomeEmbed], components: [controlRow] });
        await interaction.reply({ content: `✅ تم إنشاء تذكرتك بنجاح: ${ticketChannel}`, ephemeral: true });
    }

    if (interaction.isButton()) {
        const config = serverConfigs.get(interaction.guildId);

        if (interaction.customId === 'claim_ticket') {
            if (!config || !interaction.member.roles.cache.has(config.supportRoleId)) {
                return interaction.reply({ content: '❌ هذا الزر مخصص للإدارة فقط!', ephemeral: true });
            }
            
            const claimedEmbed = new EmbedBuilder()
                .setDescription(`🙋‍♂️ تم استلام هذه التذكرة بواسطة الإداري: ${interaction.user}`)
                .setColor('#ffff00');
            
            await interaction.channel.send({ embeds: [claimedEmbed] });
            
            const updatedRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('claimed_status').setLabel(`مستلمة بواسطة ${interaction.user.username}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId('close_history').setLabel('إغلاق التذكرة').setStyle(ButtonStyle.Danger).setEmoji('🔒') // تم تعديله لتجنب التداخل
            );
            await interaction.update({ components: [updatedRow] });
        }

        if (interaction.customId === 'close_ticket' || interaction.customId === 'close_history') {
            await interaction.reply('🔒 جاري إغلاق التذكرة وحفظ السجل...');

            if (config && config.logChannelId) {
                const logChannel = interaction.guild.channels.cache.get(config.logChannelId);
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle('🔒 إغلاق تذكرة دعم فني')
                        .setDescription(`اسم الروم: **${interaction.channel.name}**\nبواسطة: ${interaction.user}`)
                        .setColor('#ff0000')
                        .setTimestamp();
                    await logChannel.send({ embeds: [logEmbed] });
                }
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

client.login(process.env.TOKEN);
