var express = require("express");
var logger = require("morgan");
var mongoose = require("mongoose");
var path = require("path");
var exphbs = require("express-handlebars");

// Our scraping tools
// Axios is a promised-based http library, similar to jQuery's Ajax method
// It works on the client and on the server
var axios = require("axios");
var request = require("request");
var cheerio = require("cheerio");

var Note = require("./models/Note.js");
var Article = require("./models/Article.js");

// Require all models
var db = require("./models");

mongoose.Promise = Promise;

var PORT = process.env.PORT || 3000;

// Initialize Express
var app = express();

// Configure middleware

// Use morgan logger for logging requests
app.use(logger("dev"));
// Parse request body as JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// Make public a static folder
app.use(express.static("public"));

app.engine(
  "handlebars",
  exphbs({
    defaultLayout: "main",
    partialsDir: path.join(__dirname, "/views/layouts/partials")
  })
);

app.set("view engine", "handlebars");

// Connect to the Mongo DB
mongoose.connect(
  "mongodb://localhost/mongoHeadlines",
  { useNewUrlParser: true },
  { useFindAndModify: false }
);
var db = mongoose.connection;

db.on("error", function(err) {
  console.log("Error with Mongo: " + err);
});

db.once("open", function() {
  console.log("Mongoose Successful!");
});

// Routes

app.get("/", function(req, res) {
  Article.find({ saved: false }, function(err, data) {
    var hbsObject = {
      article: data
    };
    console.log(hbsObject);
    res.render("index", hbsObject);
  });
});

app.get("/saved", function(req, res) {
  Article.find({ saved: true })
    .populate("notes")
    .exec(function(err, articles) {
      var hbsObject = {
        article: articles
      };
      res.render("saved", hbsObject);
    });
});

// A GET route for scraping the nytimes
app.get("/scrape", function(req, res) {
  // First, we grab the body of the html with axios
  axios.get("http://www.nytimes.com/").then(function(response) {
    // Then, we load that into cheerio and save it to $ for a shorthand selector
    var $ = cheerio.load(response.data);

    // Now, we grab article tag, and do the following:
    $("article").each(function(i, element) {
      // Save an empty result object
      var result = {};

      summary = "";
      if ($(this).find("ul").length) {
        summary = $(this)
          .find("li")
          .first()
          .text();
      } else {
        summary = $(this)
          .find("p")
          .text();
      }

      // Add the title, summary, and link of every article using the result object data
      result.title = $(this)
        .find("h2")
        .text();
      result.summary = summary;
      result.link =
        "https://www.nytimes.com" +
        $(this)
          .find("a")
          .attr("href");

          var entry = new Article(result);



      // Create a new Article using the `result` object built from scraping
        entry.save(function(err, dbArticle) {
          if (err) {
            console.log(err);
          } else {
            console.log(dbArticle);
          }
        });
    });

    // Send a message to the client
    res.send("Scrape Complete");
  });
});

// Route for getting all Articles from the db
app.get("/articles", function(req, res) {
  // Grab every document in the Articles collection
  Article.find({})
    .then(function(dbArticle) {
      // If we were able to successfully find Articles, send them back to the client
      res.json(dbArticle);
    })
    .catch(function(err) {
      // If an error occurred, send it to the client
      res.json(err);
    });
});

//Get an article by its id
app.get("/articles/:id", function(req, res) {
  // Using the id passed in the id parameter, prepare a query that finds the matching one in our db...
  Article.findOne({ _id: req.params.id })
    // ..and populate all of the notes associated with it
    .populate("note")
    .then(function(dbArticle) {
      // If we were able to successfully find an Article with the given id, send it back to the client
      res.json(dbArticle);
    })
    .catch(function(err) {
      // If an error occurred, send it to the client
      res.json(err);
    });
});


//Save an article
app.post("/articles/save/:id", function(req, res) {
  Article.findOneAndUpdate({ "_id": req.params.id }, { "saved": true})
  .then(function(dbArticle) {
    res.send(dbArticle);
  })
  .catch(function(err) {
    console.log(err);
  });
});

//Delete an article
app.post("/articles/delete/:id", function(req, res) {
  Article.findOneAndUpdate({ "_id": req.params.id }, { "saved": false, "notes": []})
  .then(function(dbArticle) {
    res.send(dbArticle);
  })
  .catch(function(err) {
    console.log(err);
  })
})

//Create a new note on the article
app.post("/notes/save/:id", function(req, res) {
  var newNote = new Note({
    body: req.body.text,
    article: req.params.id
  });
  console.log(req.body);
  newNote.save(function(err, note) {
    if (err) {
      console.log(err);
    } else {
      Article.findOneAndUpdate({ "_id": req.params.id }, {$push: { "notes": note } })
      .then(function(dbNote) {
        res.send(dbNote);
      })
      .catch(function(err) {
        res.send(err);
      });
    }
  });
});

//Delete notes
app.delete("/notes/delete/:note_id/:article_id", function(req, res) {
  Note.findOneAndRemove({ "_id": req.params.note_id }, function(err) {
    if (err) {
      console.log(err);
      res.send(err);
    } else {
      db.Article.findOneAndUpdate({ "_id": req.params.article_id }, {$pull: {"notes": req.params.note_id}})
      .then(function(dbNote) {
        res.send("Note Deleted");
      })
      .catch(function(err) {
        res.send(err);
      });
    }
  });
});

// Start the server
app.listen(PORT, function() {
  console.log("App running on port " + PORT + "!");
});
