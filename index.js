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
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", async () => {
  console.log("Ticket Bot Online");

  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const channel = guild.channels.cache.find(c => c.name === "ticket-panel");

  if (!channel) return console.log("Create a channel named ticket-panel");

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
        value: c.value,
      }))
    );

  const row = new ActionRowBuilder().addComponents(menu);

  channel.send({ embeds: [embed], components: [row] });
});

client.on("interactionCreate", async (i) => {
  if (i.isStringSelectMenu()) {
    const choice = config.categories.find(c => c.value === i.values[0]);

    const channel = await i.guild.channels.create({
      name: `ticket-${i.user.username}`,
      type: ChannelType.GuildText,
      parent: choice.categoryId,
      permissionOverwrites: [
        { id: i.guild.id, deny: ["ViewChannel"] },
        { id: i.user.id, allow: ["ViewChannel", "SendMessages"] },
      ],
    });

    await channel.send({
      content: `<@${i.user.id}>`,
      embeds: [
        new EmbedBuilder()
          .setColor(config.embedColor)
          .setTitle(choice.label)
          .setDescription("A staff member will assist you shortly."),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("close_ticket")
            .setLabel("Close Ticket")
            .setStyle(ButtonStyle.Danger)
        ),
      ],
    });

    await i.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
  }

  if (i.isButton() && i.customId === "close_ticket") {
    const transcript = await createTranscript(i.channel);

    try {
      await i.user.send({ files: [transcript] });
    } catch {}

    const log = await client.channels.fetch(process.env.TRANSCRIPT_CHANNEL);
    log.send({ files: [transcript] });

    await i.channel.delete();
  }
});

client.login(process.env.TOKEN);
