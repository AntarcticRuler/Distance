// Resources used
// https://developer.mapquest.com/documentation/directions-api/route-matrix/post/
// https://developer.mapquest.com/documentation/geocoding-api/batch/post/

// NICKSTUDIOS
// - AntarcticRuler

const Discord = require("discord.js");
var client = new Discord.Client();

const assert = require("assert");

const token = process.env.TOKEN;

const MongoClient = require("mongodb").MongoClient;

const url = process.env.MONGO_URL;

const dbClient = new MongoClient(url, { useUnifiedTopology: true });

const getDistance = require("geolib").getDistance;

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
          "You are already registered!\nUse the change command instead:\n*change Town, State/Province, Country"
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
  // Checks to see if you are changing your town in DMs or not
  if (message.channel.type != "dm")
    return message.channel.send(
      new Discord.RichEmbed().setDescription(
        "You must change your town in DMs!"
      )
    );

  // Gets the new location to be updated
  let newLocation = message.content
    .slice(`${prefix}change `.length)
    .toLowerCase();
  // Updates the new location
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

// Old code that routes between two towns/cities
// Posts the towns and gets the request for distances
// function dist(p1, p2, message) {
//   axios
//     .post(
//       `http://www.mapquestapi.com/directions/v2/routematrix?key=${mpqKey}`,
//       {
//         locations: [p1, p2]
//       }
//     )
//     .then(res => {
//       returnDistance(res, message);
//     })
//     .catch(error => {
//       console.error(error);
//     });
// }
// Sends to the channel the message with the distance
// function returnDistance(res, message) {
//   let embed = new Discord.RichEmbed();
//   if (res.data.distance)
//     embed.setDescription(
//       `You and the user are ${res.data.distance[1]} mi apart!`
//     );
//   else
//     embed.setDescription(
//       `Cannot find the distance between the two users.\nEither the locations are invalid, or the users are in different countries.`
//     );
//   message.channel.send(embed);
// }

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
      console.log(result[0].location, result[1].location);
      townToCoords(result[0].location, result[1].location, message);
    });
}

// Gets the coordinates for the two towns
function townToCoords(p1, p2, message) {
  axios
    .post(`http://www.mapquestapi.com/geocoding/v1/batch?key=${mpqKey}`, {
      locations: [
        {
          city: p1.split(",")[0],
          state: p1.split(",")[1]
        },
        {
          city: p2.split(",")[0],
          state: p2.split(",")[1]
        }
      ],
      options: { thumbMaps: false }
    })
    .then(res => {
      returnDistanceCoords(res.data.results, message);
    })
    .catch(error => {
      console.error(error);
    });
}

// Sends to the channel the message with the distance between the two coordinates
function returnDistanceCoords(res, message) {
  console.log(res);
  let p1 = res[0].locations[0].latLng;
  let p2 = res[1].locations[0].latLng;

  if (!p1)
    return message.channel.send(
      new Discord.RichEmbed().setDescription(`Your data is incorrect.`)
    );
  else if (!p1)
    return message.channel.send(
      new Discord.RichEmbed().setDescription(
        `The data of the user is incorrect.`
      )
    );

  let distance = getDistance(
    { latitude: p1.lat, longitude: p1.lng },
    { latitude: p2.lat, longitude: p2.lng }
  );

  distance = Math.floor(distance * 0.001);

  let embed = new Discord.RichEmbed().setDescription(
    `You two are ${distance} km away!`
  );
  message.channel.send(embed);
}

// Checks all users on the server to find how close you are
function getServer(message) {
  // Limits how many members the server can be
  if (message.guild.members.size >= 1000)
    return message.channel.send(
      new Discord.RichEmbed().setDescription(
        `Cannot be used in servers with more than 100 people.`
      )
    );

  // Creates the query for the search on MongoDB
  var query = [];
  query.push({ id: message.author.id });
  message.guild.members.forEach(function(member) {
    if (member.id != message.author.id) query.push({ id: member.id });
  });

  collection.find({ $or: query }).toArray(function(err, result) {
    massDistance(query, result, message);
  });
}

function massDistance(query, routes, message) {
  // Creates the postRoutes variable which is what will be posted to the API
  // Also creates an array for the user ID of each individual location
  var postRoutes = [];
  var IDs = [];
  postRoutes.push(routes[0].location);
  IDs.push(routes[0].id);
  for (let i = 0; i < routes.length; i++)
    if (routes[i].id != message.author.id) {
      postRoutes.push(routes[i].location);
      IDs.push(routes[i].id);
    }

  // Makes sure the request isnt too large
  if (postRoutes.length > 100)
    return message.channel.send(
      new Discord.RichEmbed().setDescription(`Can't post more than 100 users!`)
    );

  // Posts to the API
  axios
    .post(
      `http://www.mapquestapi.com/directions/v2/routematrix?key=${mpqKey}`,
      {
        locations: postRoutes
      }
    )
    .then(res => {
      returnMassDistance(IDs, res, message);
    })
    .catch(error => {
      console.error(error);
    });
}

// Returns the distance the API provides for all the users
function returnMassDistance(IDs, res, message) {
  let embed = new Discord.RichEmbed();
  let embedString = "";
  for (let i = 0; i < IDs.length; i++) {
    if (res.data.distance[i])
      embedString += `${client.users.get(IDs[i]).username} is ${
        res.data.distance[i]
      } mi away.\n`;
  }

  embed.setDescription(embedString);

  message.channel.send(embed);
}

const prefix = "*";
// Message is inside a function to verify that it only runs once the DB has been connected to
function runMessage() {
  client.on("message", message => {
    if (message.author.bot) return;

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
          `When registering, please type:\n*register Town, State/Province, Country\n\n[You must register in DMs]`
        )
      );
    // Change town
    else if (msg.startsWith(`${prefix}change`) && message.content.split(" ")[1])
      changeTown(message);
    // Change town w/o town
    else if (msg.startsWith(`${prefix}change`))
      return message.channel.send(
        new Discord.RichEmbed().setDescription(
          `When changing your town, please type:\n*register Town, State/Province, Country\n\n[You must change town in DMs]`
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
    else if (msg.startsWith(`${prefix}server`)) getServer(message);
    // Help command
    else if (msg.startsWith(`${prefix}help`))
      return message.channel.send(
        new Discord.RichEmbed()
          .setDescription(
            `**Registration**\n${prefix}register Town, State/Province, Country\n\n**Change Town**\n${prefix}change Town, State/Province, Country\n\n**Distance to user**\n${prefix}user @user\n\nhttp://www.nick-studios.com/discord-location`
          )
          .setAuthor(`Discord Location Commands`, client.user.avatarURL)
      );
    // Invite Command
    else if (msg.startsWith(`${prefix}invite`))
      return message.channel.send(
        new Discord.RichEmbed()
          .setDescription(
            `https://discordapp.com/oauth2/authorize?client_id=660920627032489985&scope=bot&permissions=52288`
          )
          .setAuthor(`Discord Location Invite`, client.user.avatarURL)
      );
  });
}

client.login(token);