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
            .setDescription('إعداد لوحة التذاكر المتقدمة مع خيارات وإيموجيات مخصصة')
            .addChannelOption(option =>
                option.setName('category').setDescription('قسم فتح التذاكر (Category)').addChannelTypes(ChannelType.GuildCategory).setRequired(true))
            .addRoleOption(option =>
                option.setName('support_role').setDescription('رتبة الدعم الفني').setRequired(true))
            .addChannelOption(option =>
                option.setName('log_channel').setDescription('روم السجلات (Logs)').addChannelTypes(ChannelType.GuildText).setRequired(true))
            .addStringOption(option =>
                option.setName('banner_url').setDescription('رابط صورة البانر').setRequired(true))
            // الخيار الأول (إلزامي)
            .addStringOption(option => option.setName('opt1_name').setDescription('اسم الخيار الأول (مثال: شراء)').setRequired(true))
            .addStringOption(option => option.setName('opt1_desc').setDescription('وصف الخيار الأول').setRequired(true))
            .addStringOption(option => option.setName('opt1_emoji').setDescription('إيموجي الخيار الأول (مثال: 🛒)').setRequired(true))
            // الخيار الثاني (إلزامي)
            .addStringOption(option => option.setName('opt2_name').setDescription('اسم الخيار الثاني (مثال: استفسار)').setRequired(true))
            .addStringOption(option => option.setName('opt2_desc').setDescription('وصف الخيار الثاني').setRequired(true))
            .addStringOption(option => option.setName('opt2_emoji').setDescription('إيموجي الخيار الثاني (مثال: ❓)').setRequired(true))
            // الخيار الثالث (اختياري)
            .addStringOption(option => option.setName('opt3_name').setDescription('اسم الخيار الثالث (اختياري)').setRequired(false))
            .addStringOption(option => option.setName('opt3_desc').setDescription('وصف الخيار الثالث (اختياري)').setRequired(false))
            .addStringOption(option => option.setName('opt3_emoji').setDescription('إيموجي الخيار الثالث (اختياري)').setRequired(false))
            // الخيار الرابع (اختياري)
            .addStringOption(option => option.setName('opt4_name').setDescription('اسم الخيار الرابع (اختياري)').setRequired(false))
            .addStringOption(option => option.setName('opt4_desc').setDescription('وصف الخيار الرابع (اختياري)').setRequired(false))
            .addStringOption(option => option.setName('opt4_emoji').setDescription('إيموجي الخيار الرابع (اختياري)').setRequired(false))
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
            await interaction.deferReply({ ephemeral: true });

            const category = interaction.options.getChannel('category');
            const role = interaction.options.getRole('support_role');
            logChannel = interaction.options.getChannel('log_channel');
            const bannerUrl = interaction.options.getString('banner_url');

            const optionsList = [];

            // تجميع الخيارات المتاحة
            for (let i = 1; i <= 4; i++) {
                const name = interaction.options.getString(`opt${i}_name`);
                const desc = interaction.options.getString(`opt${i}_desc`);
                const emoji = interaction.options.getString(`opt${i}_emoji`);
                if (name) {
                    optionsList.push({
                        label: name,
                        description: desc || 'اختر هذا القسم',
                        value: `option_${i}`,
                        emoji: emoji || '🎫'
                    });
                }
            }

            serverConfigs.set(interaction.guildId, {
                categoryId: category.id,
                supportRoleId: role.id,
                logChannelId: logChannel.id,
                optionsMap: optionsList.reduce((acc, opt) => { acc[opt.value] = opt.label; return acc; }, {})
            });

            // إرسال البانر
            await interaction.channel.send({ content: bannerUrl });

            const embed = new EmbedBuilder()
                .setTitle('🎫 نظام الدعم الفني والمساعدة')
                .setDescription('يرجى كتابة موضوعك بالكامل في التذكرة.\nاختر نوع الطلب من القائمة أدناه ليتم فتح غرفة خاصة بك فوراً.')
                .setColor('#2b2d31')
                .setFooter({ text: 'JEX Support Tickets System', iconURL: interaction.guild.iconURL() });

            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('ticket_select_menu')
                    .setPlaceholder('Select a ticket option')
                    .addOptions(optionsList)
            );

            await interaction.channel.send({ content: '**يرجى كتابة موضوعك بالكامل في التذكره**', embeds: [embed], components: [row] });
            await interaction.editReply({ content: '✅ تم إعداد لوحة التذاكر المخصصة بنجاح!' });
        }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select_menu') {
        const config = serverConfigs.get(interaction.guildId);
        if (!config) {
            return interaction.reply({ content: '❌ يرجى من الإدارة إعداد البوت أولاً باستخدام `/setup`', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const selectedValue = interaction.values[0];
        const typeName = config.optionsMap[selectedValue];

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

        // تخزين صاحب التذكرة في وصف الرسالة أو استخدام نظام بسيط لتعريف صاحب الروم (سنحفظه كـ topic للروم)
        await ticketChannel.setTopic(interaction.user.id);

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

        // زر تذكير العضو (يرسل له رسالة خاصة DM برابط التذكرة)
        if (interaction.customId === 'remind_user') {
            if (!config || !interaction.member.roles.cache.has(config.supportRoleId)) {
                return interaction.reply({ content: '❌ هذا الزر مخصص للإدارة فقط!', ephemeral: true });
            }

            try {
                const ownerId = interaction.channel.topic;
                if (ownerId) {
                    const ticketOwner = await interaction.guild.members.fetch(ownerId);
                    if (ticketOwner) {
                        await ticketOwner.send({
                            content: `🔔 **تذكير:** هناك تذكرة مفتوحة لك في سيرفر **${interaction.guild.name}** ويجب الرد عليها.\n🔗 رابط التذكرة: ${interaction.channel}`
                        });
                        return interaction.reply({ content: '✅ تم إرسال رسالة تذكير خاصة (DM) لصاحب التذكرة بنجاح.', ephemeral: true });
                    }
                }
            } catch (e) {
                console.log('لم يتمكن البوت من إرسال رسالة خاصة للعضو (غالباً مقفل الخاص)');
            }

            // لو قفل الخاص، يتم التذكير في الروم كبديل
            await interaction.channel.send({
                content: `🔔 **تذكير للعضو:** يرجى الرد على التذكرة: ${interaction.channel}`
            });
            await interaction.reply({ content: '⚠️ خاص العضو مغلق، تم إرسال التذكير داخل التذكرة بدلاً من الخاص.', ephemeral: true });
        }

        if (interaction.customId === 'remind_admin') {
            await interaction.channel.send({
                content: `⏰ **تذكير لفريق الدعم (<@&${config.supportRoleId}>):** يرجى الانتباه ومراجعة هذه التذكرة: ${interaction.channel}`
            });
            await interaction.reply({ content: '✅ تم تنبيه الإدارة بنجاح.', ephemeral: true });
        }
    }
});

client.login(process.env.TOKEN);
