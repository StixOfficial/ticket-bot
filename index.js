require("dotenv").config();
const http = require("http");

const {
  Client, GatewayIntentBits, ChannelType,
  EmbedBuilder, ActionRowBuilder,
  StringSelectMenuBuilder, ButtonBuilder,
  ButtonStyle, PermissionsBitField,
  ModalBuilder, TextInputBuilder,
  TextInputStyle, SlashCommandBuilder,
  REST, Routes,
  ActivityType
} = require("discord.js");

const { createTranscript } = require("discord-html-transcripts");
const config = require("./config");

http.createServer((req, res) => {
  res.writeHead(200);
  res.end("OK");
}).listen(process.env.PORT || 3000);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

/* Crash safety */
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

/* Auto-clear ephemeral messages */
function autoClear(interaction, seconds = 20) {
  setTimeout(() => {
    interaction.editReply?.({ content: "\u200B", components: [] }).catch(() => {});
  }, seconds * 1000);
}

/* One ticket per category */
async function hasOpenTicket(guild, userId, type) {
  const channels = await guild.channels.fetch();
  return channels.find(c =>
    c.topic &&
    c.topic.includes(`OPENER:${userId}`) &&
    c.topic.includes(`TYPE:${type}`)
  );
}

/* Slash command */
const commands = [ new SlashCommandBuilder().setName("panel").setDescription("Post the support panel") ];
const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

client.once("ready", async () => {
  client.user.setPresence({ activities: [{ name: "Fuze Studios Tickets", type: ActivityType.Watching }] });
  await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
  console.log("Fuze Tickets Online");
});

/* Panel */
function panelEmbed() {
  return new EmbedBuilder()
    .setColor(config.embedColor)
    .setTitle(config.panel.title)
    .setDescription(config.panel.description);
}
function panelMenu() {
  return new StringSelectMenuBuilder().setCustomId("ticket_select").setPlaceholder("Select a category...")
    .addOptions(config.categories.map(c => ({ label: c.label, emoji: c.emoji, value: c.value })));
}

client.on("interactionCreate", async i => {
  try {

    /* /panel */
    if (i.isChatInputCommand() && i.commandName === "panel") {
      await i.channel.send({ embeds:[panelEmbed()], components:[new ActionRowBuilder().addComponents(panelMenu())] });
      await i.reply({ content:"Panel posted.", ephemeral:true });
      autoClear(i);
    }

    /* Dropdown */
    if (i.isStringSelectMenu() && i.customId === "ticket_select") {
      const choice = i.values[0];
      await i.message.edit({ embeds:[panelEmbed()], components:[new ActionRowBuilder().addComponents(panelMenu())] });

      if (choice === "support") {
        if (!i.member.roles.cache.has("1447572198494703666"))
          return i.reply({ content:"❌ You need Customer role.", ephemeral:true });

        if (await hasOpenTicket(i.guild, i.user.id, "support"))
          return i.reply({ content:"❌ You already have a Script Support ticket.", ephemeral:true });

        const modal = new ModalBuilder().setCustomId("support_form").setTitle("Script Support")
          .addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("script").setLabel("Script Name").setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("version").setLabel("Version").setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("framework").setLabel("Framework").setStyle(TextInputStyle.Short).setRequired(true))
          );
        return i.showModal(modal);
      }

      if (await hasOpenTicket(i.guild, i.user.id, choice))
        return i.reply({ content:`❌ You already have a ${choice} ticket.`, ephemeral:true });

      await i.reply({ content:"Creating your ticket...", ephemeral:true });
      autoClear(i);
      return createTicket(i, choice, null);
    }

    /* Modal submit */
    if (i.isModalSubmit()) {
      await i.reply({ content:"Creating your ticket...", ephemeral:true });
      autoClear(i);
      return createTicket(i, "support", {
        script: i.fields.getTextInputValue("script"),
        version: i.fields.getTextInputValue("version"),
        framework: i.fields.getTextInputValue("framework")
      });
    }

    /* Claim */
    if (i.isButton() && i.customId === "claim") {
      await i.deferUpdate();
      await i.channel.setName(`${i.user.username}-${Math.floor(Math.random()*9000)}`);
      await i.channel.send(`**${i.user.username}** has claimed this ticket.`);
    }

    /* Close */
    if (i.isButton() && i.customId === "close") {
      await i.reply({ content:"Are you sure?", components:[
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("confirm_close").setLabel("Confirm").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("cancel_close").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
        )], ephemeral:true });
    }

    if (i.isButton() && i.customId === "confirm_close") {
      await i.update({ content:"Closing ticket...", components:[] });
      const transcript = await createTranscript(i.channel);
      await client.channels.fetch(process.env.TRANSCRIPT_CHANNEL).then(c=>c.send({files:[transcript]}));
      await i.channel.delete();
    }

    if (i.isButton() && i.customId === "cancel_close")
      return i.update({ content:"Cancelled.", components:[] });

  } catch(e){ console.error(e); }
});

/* Ticket creator */
async function createTicket(i, type, form) {
  const data = config.categories.find(c=>c.value===type);
  const ch = await i.guild.channels.create({
    name:`ticket-${i.user.username}`,
    topic:`OPENER:${i.user.id}|TYPE:${type}`,
    parent:data.categoryId,
    type:ChannelType.GuildText
  });

  const embed = new EmbedBuilder()
    .setColor("#b7ff00")
    .setAuthor({ name:"Fuze Tickets", iconURL:"https://r2.fivemanage.com/4RmswrT2g81ilzhiPT695/Bazaart_DC3DA98C-1470-45E1-B549-21F02068B249-removebg-preview.png" })
    .setDescription(`**Resource:** ${data.label}\n**Opened By:** <@${i.user.id}>`)
    .setFooter({ text:"Fuze Studios Support System" });

  if(type==="support")
    embed.addFields(
      { name:"Script", value:`\`\`\`\n${form.script}\n\n\n\`\`\`` },
      { name:"Version", value:`\`\`\`\n${form.version}\n\n\n\`\`\`` },
      { name:"Framework", value:`\`\`\`\n${form.framework}\n\n\n\`\`\`` }
    );

  await ch.send({ content:`<@${i.user.id}>`, embeds:[embed],
    components:[new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("claim").setLabel("Claim").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("close").setLabel("Close Ticket").setStyle(ButtonStyle.Danger)
    )] });

  await i.followUp({ content:`Ticket created: ${ch}`, ephemeral:true });
  autoClear(i);
}

client.login(process.env.TOKEN);
