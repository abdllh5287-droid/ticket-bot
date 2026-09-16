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

// تخزين إعدادات السيرفر و عداد التذاكر (يبدأ من 1 ويصعد تلقائياً)
const serverConfigs = new Map();
const ticketCounters = new Map();

client.once('ready', async () => {
    console.log(`[Bot Ready] متصل باسم: ${client.user.tag}`);

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

            // تعيين الصورة الفخمة التي أرسلتها في اللوحة
            const embed = new EmbedBuilder()
                .setTitle('🎫 نظام الدعم الفني والتذاكر')
                .setDescription('يرجى كتابة موضوعك بالكامل في التذكرة\nاختر نوع التذكرة من القائمة أدناه ليتم فتح روم خاص بك فوراً مع فريق الإدارة.')
                .setImage('https://i.imgur.com/YOUR_IMAGE_LINK.png') // رابط الصورة أو جعلها بدون رابط لو أردت رفعها كمرفق
                .setColor('#2b2d31')
                .setFooter({ text: 'مود الشرطة RP8 - نظام الدعم الفني' });

            // تحديث القائمة لتطابق (شراء) و (استفسار) كما طلبت
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('ticket_select_menu')
                    .setPlaceholder('Select a ticket option')
                    .addOptions([
                        { label: 'شراء', description: 'شراء اي شي من المتجر', value: 'buy', emoji: '🛒' },
                        { label: 'استفسار', description: 'استفسار عن اي شي', value: 'inquiry', emoji: '❓' }
                    ])
            );

            await interaction.channel.send({ embeds: [embed], components: [row] });
            await interaction.reply({ 
                content: `✅ تم حفظ الإعدادات بنجاح:\n📁 القسم: **${selectedCategory.name}**\n🛡️ رتبة الدعم: **${selectedRole.name}**\n📜 روم اللوغ: **${selectedLogChannel.name}**`, 
                ephemeral: true 
            });
        }
    }

    // فتح التذكرة بأرقام تصاعدية (001, 002, 003...)
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select_menu') {
        const config = serverConfigs.get(interaction.guildId);
        if (!config) {
            return interaction.reply({ content: '❌ يجب على المسؤولين إعداد البوت أولاً باستخدام أمر `/setup`!', ephemeral: true });
        }

        // جلب وتحديث عداد التذاكر الخاص بالسيرفر
        let currentCount = ticketCounters.get(interaction.guildId) || 1;
        const ticketNumber = String(currentCount).padStart(3, '0'); // يخلي الرقم يظهر كـ 001, 002 وهكذا
        ticketCounters.set(interaction.guildId, currentCount + 1);

        const ticketType = interaction.values[0];
        const typeNames = { buy: 'شراء', inquiry: 'استفسار' };
        const channelName = `ticket-${ticketNumber}`.toLowerCase(); // اسم الروم بيكون تذكرة برقم تصاعدي
        
        const ticketChannel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: config.categoryId,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                { id: config.supportRoleId, allowممتاز جداً يا عبدالله، الشغل صار مرتب واللوحة طلعت كأنها جاهزة احترافية! 

عدلت لك الكود بالكامل عشان يضبط مع الشكل اللي تبيه (بنفس التصميم والخيارات: **شراء** و **استفسار** مع شعار دسكورد التذاكر)، بالإضافة إلى **نظام العداد التسلسلي للتذاكر** (تذكرة-001، تذكرة-002، وهكذا... كل ما فتح شخص تذكرة يزيد الرقم تلقائياً).

---

### الكود البرمجي المحدث بالكامل (`index.js`)

انسخ الكود التالي وحطه في ملف `index.js` بدلاً من القديم:

```javascript
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

// تخزين إعدادات السيرفر وعداد التذاكر التصاعدي
const serverConfigs = new Map();
const ticketCounters = new Map();

client.once('ready', async () => {
    console.log(`[Bot Ready] متصل باسم: ${client.user.tag}`);

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
            const selectedCategory = interaction.options.getChannel('category');
            const selectedRole = interaction.options.getRole('support_role');
            const selectedLogChannel = interaction.options.getChannel('log_channel');

            serverConfigs.set(interaction.guildId, {
                categoryId: selectedCategory.id,
                supportRoleId: selectedRole.id,
                logChannelId: selectedLogChannel.id
            });

            // إعداد رسالة اللوحة (البانل) بنفس الشكل الاحترافي والصورة
            const embed = new EmbedBuilder()
                .setDescription('**يرجى كتابة موضوعك بالكامل في التذكرة**')
                .setImage('[https://i.imgur.com/83pZ70V.png](https://i.imgur.com/83pZ70V.png)') // استبدل الرابط برابط صورتك إذا أردت
                .setColor('#2b2d31');

            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('ticket_select_menu')
                    .setPlaceholder('Select a ticket option')
                    .addOptions([
                        { 
                            label: 'شراء', 
                            description: 'شراء اي شي من المتجر', 
                            value: 'buy', 
                            emoji: '🛒' 
                        },
                        { 
                            label: 'استفسار', 
                            description: 'استفسار عن اي شي', 
                            value: 'inquiry', 
                            emoji: '❓' 
                        }
                    ])
            );

            await interaction.channel.send({ embeds: [embed], components: [row] });
            await interaction.reply({ 
                content: `✅ تم إعداد نظام التذاكر بنجاح!`, 
                ephemeral: true 
            });
        }
    }

    // فتح التذكرة بنظام الأرقام المتسلسلة (1, 2, 3...)
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select_menu') {
        const config = serverConfigs.get(interaction.guildId);
        if (!config) {
            return interaction.reply({ content: '❌ يجب على المسؤولين إعداد البوت أولاً باستخدام أمر `/setup`!', ephemeral: true });
        }

        // جلب عداد السيرفر أو البدء من الرقم 1
        let currentCount = ticketCounters.get(interaction.guildId) || 1;
        // تنسيق الرقم ليظهر بشكل جميل مثلاً: 001, 002 أو رقم عادي
        const ticketNumber = String(currentCount).padStart(3, '0');
        ticketCounters.set(interaction.guildId, currentCount + 1);

        const ticketType = interaction.values[0];
        const typeNames = { buy: 'شراء', inquiry: 'استفسار' };
        const channelName = `تذكرة
