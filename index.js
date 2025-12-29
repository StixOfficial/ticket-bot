require("dotenv").config();
const http = require("http");

const {
  Client, GatewayIntentBits, ChannelType,
  EmbedBuilder, ActionRowBuilder,
  StringSelectMenuBuilder, ButtonBuilder,
  ButtonStyle, PermissionsBitField,
  ModalBuilder, TextInputBuilder,
  TextInputStyle, SlashCommandBuilder,
  REST, Routes
} = require("discord.js");

const { createTranscript } = require("discord-html-transcripts");
const config = require("./config");

/* Keep Railway alive */
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("OK");
}).listen(process.env.PORT || 3000);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

/* Register /panel */
const commands = [
  new SlashCommandBuilder().setName("panel").setDescription("Post the support panel")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
(async () => {
  await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
})();

client.once("ready", () => console.log("Fuze Studios Ticket Bot Online"));

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

    await i.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
    return i.reply({ content: "Panel posted.", ephemeral: true });
  }

  /* Dropdown (always resets) */
  if (i.isStringSelectMenu()) {
    const choice = i.values[0];

    const freshMenu = new StringSelectMenuBuilder()
      .setCustomId("ticket_select")
      .setPlaceholder("Select a category...")
      .addOptions(config.categories.map(c => ({
        label: c.label,
        emoji: c.emoji,
        value: c.value
      })));

    const freshEmbed = new EmbedBuilder()
      .setColor(config.embedColor)
      .setTitle(config.panel.title)
      .setDescription(config.panel.description);

    await i.update({
      embeds: [freshEmbed],
      components: [new ActionRowBuilder().addComponents(freshMenu)]
    });

    if (choice === "support") {
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

    createTicket(i, choice, null);
  }

  /* Modal Submit */
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
      return i.reply({ content: "You are not support staff.", ephemeral: true });

    await i.deferUpdate();

    const id = Math.floor(Math.random() * 9000) + 1000;
    await i.channel.setName(`${i.user.username}-${id}`);

    await i.channel.send(`**${i.user.username}** has claimed this ticket.`);

    await i.message.edit({
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel(`Claimed by ${i.user.username}`).setStyle(ButtonStyle.Success).setDisabled(true),
          new ButtonBuilder().setCustomId("close").setLabel("Close Ticket").setStyle(ButtonStyle.Danger)
        )
      ]
    });
  }

  /* Close */
  if (i.isButton() && i.customId === "close") {
    return i.reply({
      ephemeral: true,
      content: "⚠️ Are you sure you want to close this ticket?",
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("confirm_close").setLabel("Confirm").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("cancel_close").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
        )
      ]
    });
  }

  if (i.isButton() && i.customId === "cancel_close")
    return i.update({ content: "Cancelled.", components: [] });

  if (i.isButton() && i.customId === "confirm_close") {
    await i.update({ content: "Closing ticket...", components: [] });

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
    .setDescription(`**Resource:** ${data.label}\n**Opened By:** <@${i.user.id}>`)
    .addFields(
      { name: "Script", value: `\`\`\`\n${form ? form.script : "N/A"}\n\n\n\`\`\`` },
      { name: "Version", value: `\`\`\`\n${form ? form.version : "N/A"}\n\n\n\`\`\`` },
      { name: "Framework", value: `\`\`\`\n${form ? form.framework : "N/A"}\n\n\n\`\`\`` }
    )
    .setFooter({ text: "Fuze Studios Support System" });

  await channel.send({
    content: `<@&${config.staffRole}> <@${i.user.id}>`,
    allowedMentions: { roles: [config.staffRole], users: [i.user.id] },
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("claim").setLabel("Claim").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("close").setLabel("Close Ticket").setStyle(ButtonStyle.Danger)
      )
    ]
  });

  i.followUp({ content: `Ticket created: ${channel}`, ephemeral: true });
}

client.login(process.env.TOKEN);
