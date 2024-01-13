const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const app = express();
module.exports = app;
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializerDatabaseServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializerDatabaseServer();

//Getting user following people ID's

const getFollowingPeopleIdOfUser = async (username) => {
  const getTheFollowingPeopleQuery = `select following_user_id from follower 
    inner join user on user.user_id = follower.follower_user_id where user.username = ${username};`;

  const followingPeople = await db.all(getTheFollowingPeopleQuery);
  const arrayOfIds = followingPeople.map(
    (eachUser) => eachUser.following_user_id
  );
  return arrayOfIds;
};
//API1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `select * from user 
    where username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    const createUserData = `insert into user 
        (username, name, password, gender) values ('${username}', 
        '${name}', '${hashedPassword}', '${gender}')`;
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      let newUserDetail = await db.run(createUserData);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `select * from user where 
    username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);

    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "wertyuhggfg");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//Authentication token

const authenticationToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "wertyuhggfg", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        request.userId = payload.userId;

        next();
      }
    });
  }
};

//Tweet access verification

const tweetAccessVerification = async (request, response, next) => {
  const { userId } = request;
  const { tweetId } = request.params;
  const getTweetQuery = `select * from tweet inner join follower on 
    tweet.user_id = follower.following_user_id where tweet.tweet_id = '${tweetId}' 
    and follower_user_id = '${userId}';`;
  const tweet = await db.get(getTweetQuery);
  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};
//Returns the latest tweets of people whom the user follows. Return 4 tweets at a time

app.get(
  "/user/tweets/feed/",
  authenticationToken,
  async (request, response) => {
    const { username } = request;
    const followingPeopleIds = await getFollowingPeopleIdOfUser(username);
    const userTweetQuery = `select username,tweet, date_time as dateTime from 
    user inner join tweet on user.user_id = tweet.user_id where user.user_id in (${followingPeopleIds}) 
    order by date_time desc limit 4;`;
    const dbResponse = await db.all(userTweetQuery);
    response.send(dbResponse);
  }
);

//API5
app.get("/user/following/", authenticationToken, async (request, response) => {
  const { username, userId } = request;

  const userFollowingQuery = `select  name from follower inner join user on 
  user.user_id = follower.following_user_id where follower_user_id = '${userId}';`;

  const followingPeople = await db.all(userFollowingQuery);
  response.send(followingPeople);
});

//Returns the list of all names of people who follows the user

app.get("/user/followers/", authenticationToken, async (request, response) => {
  const { username, userId } = request;
  const userFollowerQuery = `select distinct name from follower inner join user 
  on user.user_id = follower.follower_user_id where following_user_id = '${userId}';`;
  const followers = await db.all(userFollowerQuery);
  response.send(followers);
});

//API 6

app.get(
  "/tweets/:tweetId/",
  authenticationToken,
  tweetAccessVerification,
  async (request, response) => {
    const { username, userId } = request;
    const { tweetId } = request.params;
    const getTweetQuery = `select tweet, (select count() from like where tweet_id = '${tweetId}') as likes, 
 (select count() from reply where tweet_id = '${tweetId}') as replies, date_time as dateTime from tweet 
 where tweet.tweet_id = '${tweetId}';`;
    const dbResponse = await db.get(getTweetQuery);
    response.send(dbResponse);
  }
);

//API7

app.get(
  "/tweets/:tweetId/likes/",
  authenticationToken,
  tweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const getLikeQuery = `select username from user inner join like on user.user_id 
    = like.user_id where tweet_id = '${tweetId}';`;

    const likeUsers = await db.all(getLikeQuery);
    const userArray = likeUsers.map((eachUser) => eachUser.username);
    response.send({ likes: userArray });
  }
);

//API8

app.get(
  "/tweets/:tweetId/replies/",
  authenticationToken,
  tweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const getRepliesQuery = `select name, reply from user inner 
    join reply on user.user_id = reply.user_id where tweet_id = '${tweetId}';`;

    const repliesUser = await db.all(getRepliesQuery);
    response.send({ replies: repliesUser });
  }
);

//API 9
app.get("/user/tweets/", authenticationToken, async (request, response) => {
  const { userId } = request;

  const getTweetQuery = `select tweet, count(Distinct like_id) as likes, 
    count(Distinct reply_id) as replies, 
    date_time as dateTime from tweet left join reply on tweet.tweet_id = reply.tweet_id 
    left join like on tweet.tweet_id = like.tweet_id where tweet.user_id =${userId} group by tweet.tweet_id;`;
  const tweets = await db.all(getTweetQuery);
  response.send(tweets);
});

//API 10

app.post("/user/tweets/", authenticationToken, async (request, response) => {
  const { tweet } = request.body;
  const userId = parseInt(request.userId);
  const dateTime = new Date().toJSON().substring(0, 19).replace("T", " ");
  const createTweetQuery = `insert into tweet(tweet,user_id,date_Time) 
    values('${tweet}', '${userId}', '${dateTime}');`;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

//API 11

app.delete(
  "/tweets/:tweetId/",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { userId } = request;
    const getTheTweetQuery = `select * from tweet where user_id = '${userId}' 
    and tweet_id = '${tweetId}';`;
    const tweet = await db.get(getTheTweetQuery);
    if (tweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `delete from tweet where tweet_id = '${tweetId}';`;

      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
