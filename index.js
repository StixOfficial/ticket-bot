require("dotenv").config();
const http = require("http");

const {
  Client, GatewayIntentBits, ChannelType,
  EmbedBuilder, ActionRowBuilder,
  StringSelectMenuBuilder, ButtonBuilder,
  ButtonStyle, PermissionsBitField,
  ModalBuilder, TextInputBuilder,
  TextInputStyle
} = require("discord.js");

const { createTranscript } = require("discord-html-transcripts");
const config = require("./config");

http.createServer((req, res) => {
  res.writeHead(200); res.end("online");
}).listen(process.env.PORT || 3000);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.once("ready", () => console.log("Ticket bot ready"));

client.on("interactionCreate", async i => {

  // PANEL
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

  // FORM SUBMIT
  if (i.isModalSubmit()) {
    const data = {
      script: i.fields.getTextInputValue("script"),
      version: i.fields.getTextInputValue("version"),
      framework: i.fields.getTextInputValue("framework")
    };

    createTicket(i, "support", data);
  }

  // CLAIM
  if (i.isButton() && i.customId === "claim") {
    if (!i.member.roles.cache.has(config.staffRole))
      return i.reply({ content: "No permission.", ephemeral: true });

    await i.update({
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel(`Claimed by ${i.user.username}`).setStyle(ButtonStyle.Success).setDisabled(true)
      )]
    });
  }

  // CLOSE
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

  let desc = `Opened by <@${i.user.id}>`;
  if (form) desc += `\n\n**Script:** ${form.script}\n**Version:** ${form.version}\n**Framework:** ${form.framework}`;

  await channel.send({
    content: `<@${config.staffRole}> <@${i.user.id}>`,
    embeds: [new EmbedBuilder().setColor(config.embedColor).setTitle(data.label).setDescription(desc)],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("claim").setLabel("Claim Ticket").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("close").setLabel("Close Ticket").setStyle(ButtonStyle.Danger)
      )
    ]
  });

  i.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
}

client.login(process.env.TOKEN);
