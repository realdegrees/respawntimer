import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v9";
import {
  ActivityType,
  ButtonInteraction,
  CacheType,
  Client,
  CommandInteraction,
  GatewayIntentBits,
  Interaction,
  InteractionType,
  User,
} from "discord.js";
import logger from "../lib/logger";
import { Create } from "./commands/create";
import { Settings } from "./commands/settings";
import { Command } from "./commands/command";
import { Invite } from "./commands/invite";
import { setTimeout } from "timers/promises";
import {
  EPHEMERAL_REPLY_DURATION_SHORT,
  WARTIMER_INTERACTION_SPLIT,
} from "./common/constant";
import { EWidgetButtonID, Widget } from "./widget";
import { DBGuild } from "./common/types/dbGuild";
import Database from "./db/database";
import { EInteractionType } from "./common/types/interactionType";

class Bot {
  public static client: Client;
  public static user: User;

  private static async handleButton(
    interaction: ButtonInteraction
  ): Promise<void> {
    if (!interaction.guild) return;
    const [, typeId] = interaction.customId.split(WARTIMER_INTERACTION_SPLIT);

    if (typeId === EInteractionType.WIDGET) {
      const dbGuild = await Database.getGuild(interaction.guild.id).catch(
        (e) => {
          logger.error(e);
          return undefined;
        }
      );
      if (!dbGuild) return;

      // Update dbGuild to use the clicked widget
      const message = interaction.message;
      dbGuild.widget.channelId = message.channel.id;
      dbGuild.widget.messageId = message.id;
      await dbGuild.save();

      const widget = await Widget.find(dbGuild);
      widget?.handleInteraction(interaction);
    }
  }
  private static async handleCommand(
    interaction: CommandInteraction,
    commands: Command[]
  ): Promise<void> {
    const command = commands.find(
      (command) => command.name === interaction.commandName
    );
    try {
      command
        ? await command.execute(interaction)
        : await interaction
            .reply({ ephemeral: true, content: "Command not found." })
            .catch(logger.error);
    } catch (e) {
      if (!interaction) {
        logger.error(
          "Error occured in command " +
            +" but interaction is not available anymore"
        );
        return;
      }
      if (interaction.isRepliable()) {
        await (interaction.replied ? interaction.editReply : interaction.reply)(
          {
            ephemeral: true,
            content:
              e instanceof Error
                ? e.message
                : e?.toString?.() || "Unknown Error",
          }
        ).catch(logger.error);
        await setTimeout(EPHEMERAL_REPLY_DURATION_SHORT);
        await interaction.deleteReply().catch(logger.error);
      }
      logger.debug("Command failed for interaction: " + interaction.toJSON());
    }
  }
  public static async init(): Promise<Client> {
    return new Promise((resolve, reject) => {
      const client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildVoiceStates,
          GatewayIntentBits.GuildMessages,
        ],
      });
      const token = process.env["DISCORD_CLIENT_TOKEN"];
      const clientId = process.env["DISCORD_CLIENT_ID"];
      const commands = [
        new Create(client),
        new Settings(client),
        new Invite(client),
      ];

      if (!token) {
        throw new Error(
          'Environment variable "DISCORD_CLIENT_TOKEN" not found!'
        );
      }
      if (!clientId) {
        throw new Error('Environment variable "DISCORD_CLIENT_ID" not found!');
      }

      client.on("interactionCreate", (interaction) => {
        switch (true) {
          case interaction.isButton(): {
            this.handleButton(interaction as ButtonInteraction);
            break;
          }
          case interaction.isCommand(): {
            this.handleCommand(interaction as CommandInteraction, commands);
            break;
          }
        }
      });
      client.on("error", (e) => {
        logger.error(e);
      });

      client.once("ready", () => {
        if (!client.user) {
          reject("Unable to start! User is undefined!");
          return;
        }

        Bot.client = client;
        Bot.user = client.user;

        client.user.setActivity({
          name: "New World",
          type: ActivityType.Playing,
        });

        // Register Commands once client is ready
        const rest = new REST({ version: "10" }).setToken(token);
        const ready = rest
          .put(Routes.applicationCommands(clientId), {
            body: commands.map((command) => command.build()),
          })
          .then(() => {
            logger.info(
              "Commands Registered: " +
                commands.map((command) => "/" + command.name).join(", ")
            );
            return client;
          });
        ready.then(resolve).catch(reject);
      });
      client.login(token);
    });
  }
}
export default Bot;
