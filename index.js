// Reasources used
// https://developer.mapquest.com/documentation/directions-api/route-matrix/post/

// NICKSTUDIOS
// - AntarcticRuler

const Discord = require("discord.js");
var client = new Discord.Client();

const assert = require("assert");

const token = process.env.TOKEN;

const MongoClient = require("mongodb").MongoClient;

const url = process.env.MONGO_URL;

const dbClient = new MongoClient(url, { useUnifiedTopology: true });

var db;
var collection;

const mpqKey = process.env.MAPQUEST_KEY;
const axios = require("axios");

// Boots up the bot
client.on("ready", () => {
  console.log("BOT ON");
  dbClient.connect(function(err) {
    assert.equal(null, err);
    console.log("DB ACTIVE");
    db = dbClient.db("Locations");
    collection = db.collection("locations");
    client.user.setActivity(`*register  |  *user`);
    runMessage();
  });
});

// Checks to see whether the user is elligable to be registered or not
function registerUser(message) {
  // Checks to see if regestiring in DM or not
  if (message.channel.type != "dm")
    return message.channel.send(
      new Discord.RichEmbed().setDescription("You must register in DMs!")
    );

  collection.find({ id: message.author.id }).toArray(function(err, result) {
    if (err) throw err;
    console.log(result);
    // Checks to see if user is already registered
    if (result.length != 0)
      return message.channel.send(
        new Discord.RichEmbed().setDescription(
          "You are already registered!\nUse the change command instead:\n*change Town, State/Province/Country"
        )
      );
    // Registers user
    else register(message);
  });
}

// Registers the user in the database
function register(message) {
  console.log("Attempting to register: " + message.author.id);
  var user = {
    id: message.author.id,
    location: message.content.slice(`${prefix}register `.length).toLowerCase()
  };
  collection.insertOne(user, function(err, res) {
    if (err) throw err;
    console.log("Inserted:\n" + user);
    message.channel.send(new Discord.RichEmbed().setDescription("Registered!"));
  });
}

// Changes the users town
function changeTown(message) {
  let newLocation = message.content
    .slice(`${prefix}change `.length)
    .toLowerCase();
  collection.updateOne(
    { id: message.author.id },
    { $set: { location: newLocation } },
    function(err, res) {
      if (err) throw err;
      message.channel.send(
        new Discord.RichEmbed().setDescription(
          "Your hometown has been updated!"
        )
      );
    }
  );
}

// Posts the towns and gets the request for distances
function dist(p1, p2, message) {
  axios
    .post(
      `http://www.mapquestapi.com/directions/v2/routematrix?key=${mpqKey}`,
      {
        locations: [p1, p2]
      }
    )
    .then(res => {
      returnDistance(res, message);
    })
    .catch(error => {
      console.error(error);
    });
}

// Pulls the request from the database for the author and the target
function calculateDistance(author, target, message) {
  // Check to see if you are checking your own location
  if (author == target)
    return message.channel.send(
      new Discord.RichEmbed().setDescription(
        "You are currently standing in your own location!\nNot much point in giving a distance of 0..."
      )
    );

  collection
    .find({ $or: [{ id: author }, { id: target }] })
    .toArray(function(err, result) {
      if (err) throw err;
      if (result.length != 2)
        return message.channel.send(
          new Discord.RichEmbed().setDescription(
            "The other user does not have a hometown set!"
          )
        );
      dist(result[0].location, result[1].location, message);
    });
}

// Sends to the channel the message with the distance
function returnDistance(res, message) {
  let embed = new Discord.RichEmbed();
  if (res.data.distance)
    embed.setDescription(
      `You and the user are ${res.data.distance[1]} mi apart!`
    );
  else
    embed.setDescription(
      `Cannot find the distance between the two users.\nEither the locations are invalid, or the users are in different countries.`
    );
  message.channel.send(embed);
}

const prefix = "*";
// Message is inside a function to verify that it only runs once the DB has been connected to
function runMessage() {
  client.on("message", message => {
    // Variables
    var mention = message.mentions.users.first();
    let msg = message.content.toLowerCase();
    // Register User
    if (msg.startsWith(`${prefix}register`) && message.content.split(" ")[1])
      registerUser(message);
    // Register w/o town
    else if (msg.startsWith(`${prefix}register`))
      return message.channel.send(
        new Discord.RichEmbed().setDescription(
          `When registering, please type:\n*register Town, State/Province/Country`
        )
      );
    // Change town
    else if (msg.startsWith(`${prefix}change`) && message.content.split(" ")[1])
      changeTown(message);
    // Change town w/o town
    else if (msg.startsWith(`${prefix}change`))
      return message.channel.send(
        new Discord.RichEmbed().setDescription(
          `When changing your town, please type:\n*register Town, State/Province/Country`
        )
      );
    // @ User
    else if (msg.startsWith(`${prefix}user`) && mention)
      calculateDistance(message.author.id, mention.id, message);
    // User without @
    else if (msg.startsWith(`${prefix}user`))
      return message.channel.send(
        new Discord.RichEmbed().setDescription(
          `Please @ a user after the command:\n*user @user`
        )
      );
    // Help command
    else if (msg.startsWith(`${prefix}help`))
      return message.channel.send(
        new Discord.RichEmbed()
          .setDescription(
            `**Registration**\n${prefix}register Town, State/Province/Country\n\n**Change Town**\n${prefix}change Town, State/Province/Country\n\n**Distance to user**\n${prefix}user @user\n\nhttp://www.nick-studios.com/discord-location`
          )
          .setAuthor(`Discord Location Commands`, client.user.avatarURL)
      );
  });
}

client.login(token);