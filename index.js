require("dotenv").config();
const http = require("http");

const {
  Client,
  GatewayIntentBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");

const { createTranscript } = require("discord-html-transcripts");
const config = require("./config");

/* Railway keep-alive */
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("OK");
}).listen(process.env.PORT || 3000);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

/* Register /panel */
const commands = [
  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Post the support panel")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log("Slash command registered");
  } catch (e) {
    console.error("Slash command error", e);
  }
})();

client.once("ready", () => {
  console.log("Ticket Bot Online");
});

client.on("interactionCreate", async (i) => {

  /* /panel */
  if (i.isChatInputCommand() && i.commandName === "panel") {
    if (!i.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return i.reply({ content: "No permission.", ephemeral: true });

    const embed = new EmbedBuilder()
      .setColor(config.embedColor)
      .setTitle(config.panel.title)
      .setDescription(config.panel.description);

    const menu = new StringSelectMenuBuilder()
      .setCustomId("ticket_select")
      .setPlaceholder("Select a category...")
      .addOptions(config.categories.map(c => ({
        label: c.label,
        emoji: c.emoji,
        value: c.value
      })));

    await i.channel.send({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(menu)]
    });

    return i.reply({ content: "Panel posted.", ephemeral: true });
  }

  /* Dropdown */
  if (i.isStringSelectMenu()) {
    if (i.values[0] === "support") {
      const modal = new ModalBuilder()
        .setCustomId("support_form")
        .setTitle("Script Support");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("script").setLabel("Script Name").setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("version").setLabel("Version").setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("framework").setLabel("Framework").setStyle(TextInputStyle.Short).setRequired(true)
        )
      );

      return i.showModal(modal);
    }

    createTicket(i, i.values[0], null);
  }

  /* Modal submit */
  if (i.isModalSubmit()) {
    const data = {
      script: i.fields.getTextInputValue("script"),
      version: i.fields.getTextInputValue("version"),
      framework: i.fields.getTextInputValue("framework")
    };

    createTicket(i, "support", data);
  }

  /* Claim */
  if (i.isButton() && i.customId === "claim") {
    if (!i.member.roles.cache.has(config.staffRole))
      return i.reply({ content: "No permission.", ephemeral: true });

    await i.update({
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel(`Claimed by ${i.user.username}`)
            .setStyle(ButtonStyle.Success)
            .setDisabled(true)
        )
      ]
    });
  }

  /* Close */
  if (i.isButton() && i.customId === "close") {
    const transcript = await createTranscript(i.channel);
    try { await i.user.send({ files: [transcript] }); } catch {}
    const log = await client.channels.fetch(process.env.TRANSCRIPT_CHANNEL);
    await log.send({ files: [transcript] });
    await i.channel.delete();
  }
});

async function createTicket(i, type, form) {
  const data = config.categories.find(c => c.value === type);

  const channel = await i.guild.channels.create({
    name: `ticket-${i.user.username}`,
    parent: data.categoryId,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      { id: i.guild.id, deny: ["ViewChannel"] },
      { id: i.user.id, allow: ["ViewChannel", "SendMessages"] },
      { id: config.staffRole, allow: ["ViewChannel", "SendMessages"] }
    ]
  });

  const embed = new EmbedBuilder()
    .setColor("#b7ff00")
    .setTitle("✅ Resource Update")
    .setDescription(
      `**Resource:** ${data.label}\n` +
      `**Opened By:** <@${i.user.id}>\n\n` +
      `**Changes**\n**Added:**\n\`\`\`diff\n+ Support request opened\n\`\`\`\n` +
      `**Changed File(s):**\n\`\`\`${form ? `Script: ${form.script}\nVersion: ${form.version}\nFramework: ${form.framework}` : "General ticket"}\`\`\``
    )
    .setFooter({ text: "Prism Scripts Support System" });

  await channel.send({
    content: `<@&${config.staffRole}> <@${i.user.id}>`,
    allowedMentions: { roles: [config.staffRole], users: [i.user.id] },
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("claim").setLabel("Get Notifications").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("close").setLabel("Remove Notifications").setStyle(ButtonStyle.Danger)
      )
    ]
  });

  i.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
}

client.login(process.env.TOKEN);
