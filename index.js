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
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");

const { createTranscript } = require("discord-html-transcripts");
const config = require("./config");

/* Keep Railway Alive */
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Ticket bot running");
}).listen(process.env.PORT || 3000);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
});

/* Register Slash Command */
const commands = [
  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Post the ticket panel")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );
})();

client.once("ready", () => {
  console.log("Ticket Bot Online");
});

client.on("interactionCreate", async (i) => {
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
      .addOptions(
        config.categories.map(c => ({
          label: c.label,
          description: c.description,
          emoji: c.emoji,
          value: c.value
        }))
      );

    await i.channel.send({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(menu)]
    });

    await i.reply({ content: "Panel posted.", ephemeral: true });
  }

  if (i.isStringSelectMenu()) {
    const choice = config.categories.find(c => c.value === i.values[0]);

    const channel = await i.guild.channels.create({
      name: `ticket-${i.user.username}`,
      type: ChannelType.GuildText,
      parent: choice.categoryId,
      permissionOverwrites: [
        { id: i.guild.id, deny: ["ViewChannel"] },
        { id: i.user.id, allow: ["ViewChannel", "SendMessages"] }
      ]
    });

    await channel.send({
      content: `<@${i.user.id}>`,
      embeds: [
        new EmbedBuilder()
          .setColor(config.embedColor)
          .setTitle(choice.label)
          .setDescription("A staff member will assist you shortly.")
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("close_ticket")
            .setLabel("Close Ticket")
            .setStyle(ButtonStyle.Danger)
        )
      ]
    });

    await i.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
  }

  if (i.isButton() && i.customId === "close_ticket") {
    const transcript = await createTranscript(i.channel);

    try { await i.user.send({ files: [transcript] }); } catch {}

    const log = await client.channels.fetch(process.env.TRANSCRIPT_CHANNEL);
    log.send({ files: [transcript] });

    await i.channel.delete();
  }
});

client.login(process.env.TOKEN);
