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

const serverConfigs = new Map();
const ticketCounters = new Map();

client.once('ready', async () => {
    console.log(`[Bot Ready] متصل باسم: ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder()
            .setName('setup')
            .setDescription('إعداد لوحة التذاكر')
            .addChannelOption(option =>
                option.setName('category')
                    .setDescription('القسم (Category) الخاص بفتح التذاكر')
                    .addChannelTypes(ChannelType.GuildCategory)
                    .setRequired(true))
            .addRoleOption(option =>
                option.setName('support_role')
                    .setDescription('رتبة الدعم الفني المسؤول عن التذاكر')
                    .setRequired(true))
            .addChannelOption(option =>
                option.setName('log_channel')
                    .setDescription('روم السجلات (Logs) لإغلاق التذاكر')
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('banner_url')
                    .setDescription('رابط صورة البانر')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('option1_name')
                    .setDescription('اسم الخيار الأول (مثال: شراء)')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('option2_name')
                    .setDescription('اسم الخيار الثاني (مثال: استفسار)')
                    .setRequired(true))
            .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('[Slash Commands] تم تسجيل أمر /setup بنجاح!');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'setup') {
            // الرد الفوري لمنع خطأ الـ 3 ثواني
            await interaction.deferReply({ ephemeral: true });

            const category = interaction.options.getChannel('category');
            const role = interaction.options.getRole('support_role');
            const logChannel = interaction.options.getChannel('log_channel');
            const bannerUrl = interaction.options.getString('banner_url');
            
            const opt1Name = interaction.options.getString('option1_name');
            const opt2Name = interaction.options.getString('option2_name');

            serverConfigs.set(interaction.guildId, {
                categoryId: category.id,
                supportRoleId: role.id,
                logChannelId: logChannel.id,
                optionsData: {
                    opt1: { name: opt1Name, value: 'option_1' },
                    opt2: { name: opt2Name, value: 'option_2' }
                }
            });

            // إرسال البانر في الروم العام
            await interaction.channel.send({ content: bannerUrl });

            // لوحة التذاكر
            const embed = new EmbedBuilder()
                .setTitle('🎫 نظام الدعم الفني والمساعدة')
                .setDescription('يرجى كتابة موضوعك بالكامل في التذكرة.\nاختر نوع الطلب من القائمة أدناه ليتم فتح غرفة خاصة بك فوراً.')
                .setColor('#2b2d31')
                .setFooter({ text: 'JEX Support Tickets System', iconURL: interaction.guild.iconURL() });

            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('ticket_select_menu')
                    .setPlaceholder('Select a ticket option')
                    .addOptions([
                        { label: opt1Name, description: 'انقر هنا لاختيار هذا القسم', value: 'option_1', emoji: '🛒' },
                        { label: opt2Name, description: 'انقر هنا لاختيار هذا القسم', value: 'option_2', emoji: '❓' }
                    ])
            );

            await interaction.channel.send({ content: '**يرجى كتابة موضوعك بالكامل في التذكره**', embeds: [embed], components: [row] });
            await interaction.editReply({ content: '✅ تم إعداد لوحة التذاكر بنجاح!' });
        }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select_menu') {
        const config = serverConfigs.get(interaction.guildId);
        if (!config) {
            return interaction.reply({ content: '❌ يرجى من الإدارة إعداد البوت أولاً باستخدام `/setup`', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const selectedValue = interaction.values[0];
        const optKey = selectedValue === 'option_1' ? 'opt1' : 'opt2';
        const typeName = config.optionsData[optKey].name;

        let currentCount = ticketCounters.get(interaction.guildId) || 0;
        currentCount++;
        ticketCounters.set(interaction.guildId, currentCount);

        const paddedId = String(currentCount).padStart(4, '0');
        const channelName = `🎫│تذكرة-${paddedId}`;

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
            .setTitle(`🎫 تذكرة جديدة: ${typeName} (#${paddedId})`)
            .setDescription(`مرحباً بك ${interaction.user}!\nنوع الطلب: **${typeName}**\n\nيرجى كتابة تفاصيل موضوعك بالكامل وسيقوم فريق الدعم بالرد عليك قريباً.`)
            .setColor('#00ffcc');

        const controlRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('claim_ticket').setLabel('استلام التذكرة').setStyle(ButtonStyle.Success).setEmoji('🙋‍♂️'),
            new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
            new ButtonBuilder().setCustomId('remind_user').setLabel('تذكير العضو').setStyle(ButtonStyle.Primary).setEmoji('🔔'),
            new ButtonBuilder().setCustomId('remind_admin').setLabel('تذكير الإداري').setStyle(ButtonStyle.Secondary).setEmoji('⏰')
        );

        await ticketChannel.send({ 
            content: `${interaction.user} | <@&${config.supportRoleId}>`, 
            embeds: [welcomeEmbed], 
            components: [controlRow] 
        });

        await interaction.editReply({ content: `✅ تم فتح تذكرتك بنجاح: ${ticketChannel}` });
    }

    if (interaction.isButton()) {
        const config = serverConfigs.get(interaction.guildId);

        if (interaction.customId === 'claim_ticket') {
            if (!config || !interaction.member.roles.cache.has(config.supportRoleId)) {
                return interaction.reply({ content: '❌ هذا الزر مخصص لفريق الإدارة فقط!', ephemeral: true });
            }
            
            const claimedEmbed = new EmbedBuilder()
                .setDescription(`🙋‍♂️ تم استلام التذكرة بواسطة الإداري: ${interaction.user}`)
                .setColor('#ffff00');
            
            await interaction.channel.send({ embeds: [claimedEmbed] });
            await interaction.reply({ content: '✅ تم تسجيل استلامك للتذكرة.', ephemeral: true });
        }

        if (interaction.customId === 'close_ticket') {
            await interaction.reply('🔒 جاري إغلاق التذكرة وحفظ السجل...');

            if (config && config.logChannelId) {
                const logChannel = interaction.guild.channels.cache.get(config.logChannelId);
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle('🔒 سجل إغلاق تذكرة')
                        .setDescription(`اسم الغرفة: **${interaction.channel.name}**\nأُغلقت بواسطة: ${interaction.user}`)
                        .setColor('#ff0000')
                        .setTimestamp();
                    await logChannel.send({ embeds: [logEmbed] });
                }
            }

            setTimeout(async () => {
                try {
                    await interaction.channel.delete();
                } catch (e) {
                    console.log('خطأ أثناء حذف التذكرة');
                }
            }, 3000);
        }

        if (interaction.customId === 'remind_user') {
            if (!config || !interaction.member.roles.cache.has(config.supportRoleId)) {
                return interaction.reply({ content: '❌ هذا الزر مخصص للإدارة فقط!', ephemeral: true });
            }

            await interaction.channel.send({
                content: `🔔 **تذكير للعضو:** هناك تذكرة مفتوحة لك ويجب الرد عليها في هذا الروم: ${interaction.channel}`
            });
            await interaction.reply({ content: '✅ تم إرسال تنبيه للعضو في التذكرة بنجاح.', ephemeral: true });
        }

        if (interaction.customId === 'remind_admin') {
            await interaction.channel.send({
                content: `⏰ **تذكير لفريق الدعم (<@&${config.supportRoleId}>):** يرجى الانتباه ومراجعة هذه التذكرة المفتوحة: ${interaction.channel}`
            });
            await interaction.reply({ content: '✅ تم تنبيه الإدارة بنجاح.', ephemeral: true });
        }
    }
});

client.login(process.env.TOKEN);
