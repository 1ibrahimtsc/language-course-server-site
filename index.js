const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }
  // bearer token
  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.5d8nja0.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // await client.connect();

    const usersCollection = client.db("SummerCampDb").collection("users");
    const cartCollection = client.db("SummerCampDb").collection("carts");
    const classesCollection = client.db("SummerCampDb").collection("classes");
    const paymentCollection = client.db("SummerCampDb").collection("payments");

    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });

      res.send({ token });
    });

    // Warning: use verifyJWT before using verifyAdmin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden message" });
      }
      next();
    };

    // api for get users
    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      // const user = req.body;
      //const query = { email: user.email };

      const user = {
        name: req.body.name,
        email: req.body.email,
        photoURL: req.body.photoURL,
      };
      const query = { email: req.body.email };

      const existingUser = await usersCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: "user already exists" });
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // update users student to instructor or admin
    app.put("/users/:id", async (req, res) => {
      const id = req.params.id;

      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: req.body },
        { upsert: true }
      );
      res.send(result);
    });

    // security layer: verifyJWT
    // email same
    // check student
    app.get("/users/student/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ student: false });
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { student: user?.role === "student" };

      res.send(result);
    });

    // security layer: verifyJWT
    // email same
    // check instructor
    app.get("/users/instructor/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ instructor: false });
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { instructor: user?.role === "instructor" };

      res.send(result);
    });

    // security layer: verifyJWT
    // email same
    // check admin
    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      try {
        const email = req.params.email;

        if (req.decoded.email !== email) {
          return res.send({ admin: false });
        }

        const query = { email: email };
        const user = await usersCollection.findOne(query);

        if (!user) {
          return res.send({ admin: false });
        }

        const result = {
          admin: user.role === "admin" || user.role === "super-admin",
        };

        res.send(result);
      } catch (error) {
        console.error("Error in retrieving user:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };

      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // cart collection apis
    // app.get("/carts", verifyJWT, async (req, res) => {
    app.get("/carts", verifyJWT, async (req, res) => {
      const email = req.query.email;

      if (!email) {
        res.send([]);
      }

      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }

      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/carts", verifyJWT, async (req, res) => {
      const email = req.body.email;

      if (!email) {
        res.send([]);
      }

      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }

      const selecteditem = req.body;

      const result = await cartCollection.insertOne(selecteditem);
      res.send(result);
    });

    // api for delete from cart
    app.delete("/deleteselectedclasses/:id", async (req, res) => {
      const id = req.params.id;

      const getclass = await cartCollection.findOne({ _id: new ObjectId(id) });

      let numberofstudents;
      if (getclass.numberofstudents) {
        numberofstudents = getclass.numberofstudents - 1;
      }

      const classUpdate = await classesCollection.updateOne(
        { _id: new ObjectId(getclass.classId) },
        {
          $set: {
            numberofstudents: parseInt(numberofstudents),
          },
        }
      );

      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });

    // classes collection apis
    //get classes
    app.get("/classes", async (req, res) => {
      const result = await classesCollection.find().toArray();
      res.send(result);
    });

    // api for get my classes
    // TODO use verifyJWT
    app.get("/myclasses", verifyJWT, async (req, res) => {
      const email = req.query.email;

      if (!email) {
        res.send([]);
      }

      const decodedEmail = req.decoded.email;

      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }

      const query = { instructorEmail: email };
      const result = await classesCollection.find(query).toArray();

      res.send(result);
    });

    //get popular classes
    app.get("/popularclasses", async (req, res) => {
      const result = await classesCollection
        .find()
        .sort({ totalenrolledstudent: -1 })
        .limit(6)
        .toArray();

      res.send(result);
    });

    //get popular instructors
    app.get("/popularinstructors", async (req, res) => {
      const result = await usersCollection
        .find({ role: "instructor" })
        .sort({ enrolledstudent: -1 })
        .limit(6)
        .toArray();

      res.send(result);
    });

    // api for get myselectedclasses

    app.get("/myselectedclasses", verifyJWT, async (req, res) => {
      const email = req.query.email;

      if (!email) {
        res.send([]);
      }

      const decodedEmail = req.decoded.email;

      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }

      const user = await usersCollection.find({ email: email }).toArray();

      const idarray = user[0].selectedclasses;
      //const map1 = array1.map(x => x * 2);
      //new ObjectId("x");
      const getidarray = idarray.map((x) => {
        return new ObjectId(x);
      });

      const result = await classesCollection
        .find({
          _id: {
            $in: getidarray,
          },
        })
        .toArray();

      res.send(result);
    });

    // api for removed selected class
    app.get("/deleteselectedclasses", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const id = req.query.id;

      if (!email) {
        res.send([]);
      }

      const decodedEmail = req.decoded.email;

      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }

      const user = await usersCollection.find({ email: email }).toArray();

      const idarray = user[0].selectedclasses;
      const modifiedidarray = idarray.filter((element) => element !== id);

      const updateDoc = {
        $set: {
          selectedclasses: modifiedidarray,
        },
      };

      const result = await usersCollection.updateOne(
        { email: email },
        updateDoc
      );
      res.send(result);
    });

    ////add classes
    app.post("/classes", async (req, res) => {
      const item = req.body;

      const result = await classesCollection.insertOne({
        ...req.body,
        status: "pending",
        totalenrolledstudent: 0,
        feedback: "",
      });
      res.send(result);
    });

    // update class pending to aproved or denied
    app.put("/classes/:id", async (req, res) => {
      const id = req.params.id;

      const result = await classesCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: req.body },
        { upsert: false }
      );

      res.send(result);
    });

    // create payment intent
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // payment related api
    app.post("/payments", verifyJWT, async (req, res) => {
      const payment = req.body;

      const insertResult = await paymentCollection.insertOne(payment);

      const query = {
        _id: { $in: payment.cartItems.map((id) => new ObjectId(id)) },
      };

      const deleteResult = await cartCollection.deleteMany(query);

      const queryforupdateclasses = {
        _id: { $in: payment.selectedclasses.map((id) => new ObjectId(id)) },
      };

      const resultupdateclasses = await classesCollection.updateMany(
        queryforupdateclasses,
        {
          $inc: {
            availableSeats: -1,
            totalenrolledstudent: 1,
          },
        }
      );

      const queryforupdateinstructors = {
        email: { $in: payment.instructorEmails.map((email) => email) },
      };

      const resultupdateusers = await usersCollection.updateMany(
        queryforupdateinstructors,
        {
          $inc: {
            enrolledstudent: 1,
          },
        }
      );

      res.send({ insertResult, deleteResult });
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Summer Camp School is running");
});

app.listen(port, () => {
  console.log(`Summer Camp School is running on port ${port}`);
});
