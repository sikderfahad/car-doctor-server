import express, { json } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
import jwt from "jsonwebtoken";

dotenv.config();
const port = process.env.PORT || 5000;
const DB_USER = process.env.DB_USER;
const DB_PASS = process.env.DB_PASS;

const app = express();

// Midlewares
app.use(json());
app.use(cors());

const uri = `mongodb+srv://${DB_USER}:${DB_PASS}@cluster0.2wh4i.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const db = client.db("car-doctor-db");
const servicesCollection = db.collection("car-services");
const productsCollection = db.collection("products");
const teamMemberCollection = db.collection("team-member");
const testimonials = db.collection("testimonials");

// MongoDB routing ______________________________
app.get("/", (req, res) => {
  res.send("Car doctor is running ...");
});

app.get("/car-services", async (req, res, next) => {
  const { fields } = req.query;
  let projection = {};
  if (fields) {
    fields.split(",").forEach((field) => {
      projection[field] = 1;
    });
  }

  try {
    const data = await servicesCollection.find({}, { projection }).toArray();
    if (!data.length) {
      return next({ status: 404, message: "car services data not found" });
    }
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

app.get("/car-services/:id", async (req, res, next) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  try {
    const data = await servicesCollection.findOne(query);
    if (!data) {
      return next({ status: 404, message: "no data found" });
    }
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

app.get("/car-products", async (req, res, next) => {
  const { fields } = req.query;
  let projection = {};
  if (fields) {
    fields.split(",").forEach((field) => {
      projection[field] = 1;
    });
  }

  try {
    const data = await productsCollection.find({}, { projection }).toArray();

    if (!data.length) {
      return next({ status: 404, message: "car products not found" });
    }

    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

app.get("/team-members", async (req, res, next) => {
  try {
    const data = await teamMemberCollection.find().toArray();
    if (!data.length) {
      return next({ status: 404, message: "team members data not found" });
    }
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

app.get("/testimonials", async (req, res) => {
  try {
    const data = await testimonials.find().toArray();
    if (!data.length) {
      return next({ status: 404, message: "testimonials data not found" });
    }
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// Error handling midleware
const errorHandle = (err, req, res, next) => {
  console.error(err?.stack);
  res
    .status(err?.status || 500)
    .json({ success: false, message: err?.message || "Internal server error" });
};

app.use(errorHandle);

// Server starting function
const startServer = async () => {
  await client.db("admin").command({ ping: 1 });
  console.log("Pinged your deployment. You successfully connected to MongoDB!");

  app.listen(port, () =>
    console.log(`server running on http://localhost:${port}`)
  );
};

startServer();
