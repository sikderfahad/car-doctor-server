import express, { json, query } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import fs from "fs";
import verifyFirebaseToken from "./verifyFirebaseToken.js";
import verifyAdmin from "./verifyAdmin.js";
import admin from "firebase-admin";

dotenv.config();
const port = process.env.PORT || 5000;
const DB_USER = process.env.DB_USER;
const DB_PASS = process.env.DB_PASS;
const JWT_SECRET = process.env.JWT_SECRET;

const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, "base64").toString("utf-8")
);
// const serviceAccount = JSON.parse(
//   fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT, "utf8")
// );

// const serviceAccount = JSON.parse(
//   fs.readFileSync("./firebase-adminsdk.json", "utf8")
// );

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
const auth = admin.auth(); // For Firebase Authentication
const firestoreDb = admin.firestore(); // If using Firestore
export { firestoreDb };

// Midlewares
app.use(json());
app.use(
  cors({
    origin: [
      "https://car-doctor-003.web.app",
      "http://localhost:5173",
      "http://localhost:5174",
    ],
    credentials: true,
  })
);
app.use(cookieParser());

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token)
    return res.status(401).send({ success: false, message: "Unauthorized" });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err)
      return res.status(403).json({ success: false, message: "Forbidden" });

    req.jwtUser = decoded;
    next();
  });
};

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
const usersCollection = db.collection("users");
const serviceOrderCollection = db.collection("service-order");

app.get(
  "/users",
  verifyToken,
  verifyFirebaseToken,
  verifyAdmin,
  async (req, res, next) => {
    const { fields } = req.query;
    const slice = parseInt(req.query?.slice);
    // console.log("find user: ", req.jwtUser);
    // console.log("find user: ", req.firebaseUser.uid);

    let projection = {};
    if (fields) {
      fields.split(",").forEach((field) => {
        projection[field] = 1;
      });
    }

    try {
      let query = usersCollection.find({}, { projection });
      if (!isNaN(slice) || slice > 0) {
        query = query.limit(slice);
      }

      const data = await query.toArray();
      if (!data.length) {
        return next({ status: 404, message: "No users data found" });
      }
      // console.log("user data: ", data);
      return res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

app.get("/user", async (req, res, next) => {
  const { email } = req.query;
  const query = { email: email };
  if (!email) {
    return res
      .status(400)
      .json({ success: false, message: "Email is required" });
  }

  try {
    const data = await usersCollection.findOne(query);

    // console.log(data);
    if (!data) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ success: true, userId: data?._id });
  } catch (error) {
    next({ status: 500, message: "Internal Server Error", details: error });
  }
});

app.post("/users", async (req, res, next) => {
  const newUser = req.body;
  // const existUser = await usersCollection.findOne({ email: newUser?.email });

  // console.log("user post api: ", newUser, existUser);
  if (!newUser) {
    return;
  }
  try {
    const data = await usersCollection.insertOne(newUser);
    // console.log("post new user in mingo: ", data);
    if (!data.insertedId) {
      return next({ status: 500, message: "New user added failed to db" });
    }
    return res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
});

// app.patch("/update-user-role", async (req, res, next) => {
//   const { mongoId } = req.query;
//   console.log(mongoId);
//   const { userId, newRole } = req.body;
//   if (!userId || !newRole) {
//     return next({ status: 400, message: "Missing parameter" });
//   }
//   const query = { _id: new ObjectId(mongoId) };
//   try {
//     const userRef = firestoreDb.collection("users").doc(userId);
//     await userRef.update({ role: newRole });

//     const data = await usersCollection.updateOne(query, { role: newRole });
//     if (!data.modifiedCount) {
//       return next({ status: 500, message: "Failed to update user role" });
//     }

//     res.json({ success: true, message: "User role updated successfully" });
//   } catch (err) {
//     next(err);
//   }
// });

app.patch("/update-user-role", verifyFirebaseToken, async (req, res, next) => {
  const { mongoId } = req.query;
  const { userId, newRole } = req.body;

  if (!mongoId || !userId || !newRole) {
    return next({ status: 400, message: "Missing parameter" });
  }

  try {
    // ✅ Check if the requesting user is an admin
    const requestingUid = req.firebaseUser.uid; // Get from verified token
    // console.log("verify firebase token: ", requestingUid);
    const requestingUserRef = firestoreDb
      .collection("users")
      .doc(requestingUid);
    const requestingUserSnap = await requestingUserRef.get();

    if (
      !requestingUserSnap.exists ||
      requestingUserSnap.data().role !== "admin"
    ) {
      return next({
        status: 403,
        message: "Unauthorized: Only admins can update roles",
      });
    }

    // ✅ Update Firestore Role
    const userRef = firestoreDb.collection("users").doc(userId);
    await userRef.update({ role: newRole });

    // ✅ Update MongoDB Role
    const query = { _id: new ObjectId(mongoId) };
    const data = await usersCollection.updateOne(query, {
      $set: { role: newRole },
    });

    if (!data.modifiedCount) {
      return next({ status: 500, message: "Failed to update user role" });
    }

    res.json({ success: true, message: "User role updated successfully" });
  } catch (err) {
    next(err);
  }
});

app.patch("/users/:id", verifyToken, async (req, res, next) => {
  const { id } = req.params;
  const { newRole, lastLoginAt } = req.body;
  const query = { _id: new ObjectId(id) };

  let updateField = {};
  if (newRole) updateField.role = newRole;
  if (lastLoginAt) updateField["metadata.lastLoginAt"] = lastLoginAt;

  try {
    const data = await usersCollection.updateOne(query, { $set: updateField });
    // console.log("user lastLogin: ", data);
    if (!data.modifiedCount) {
      return next({ status: 500, message: "Failed to update user role" });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
});

app.post("/jwt", (req, res) => {
  const user = req.body;
  const token = jwt.sign(user, JWT_SECRET, { expiresIn: "1h" });
  // console.log(token);
  if (!token) res.status(400).json({ success: false });

  res
    .cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      // expires: new Data(Date.now() + 60 * 1000),
    })
    .send({ success: true });
});

app.post("/jwt-logout", (req, res) => {
  res
    .clearCookie("token", {
      maxAge: 0,
      httpOnly: true,
      secure: true,
    })
    .send({ success: true });
});

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
    let query = servicesCollection.find({}, { projection });
    const slice = parseInt(req.query.slice);

    if (!isNaN(slice) && slice > 0) {
      query = query.limit(slice);
    }

    const data = await query.toArray();
    if (!data.length) {
      return next({ status: 404, message: "car services data not found" });
    }
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

app.get("/car-services/:id", verifyToken, async (req, res, next) => {
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

app.post("/car-services", verifyToken, async (req, res, next) => {
  const serviceData = req.body;

  if (!serviceData) {
    // console.log("service data not found to post");
    return;
  }

  try {
    const data = await servicesCollection.insertOne(serviceData);
    if (!data?.insertedId) {
      return next({
        status: 401,
        message: "failed to insert new service data",
      });
    }
    res
      .status(200)
      .json({ success: true, message: "new service added successfull" });
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

app.post("/service-order", async (req, res, next) => {
  const orderInfo = req.body;
  if (typeof orderInfo !== "object" || !orderInfo) {
    return next({ status: 400, message: "Error in order info" });
  }
  try {
    const data = await serviceOrderCollection.insertOne(orderInfo);
    if (!data.insertedId) {
      return next({ status: 500, message: "Order failed to save in db" });
    }
    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

app.patch("/service-order/:id", verifyToken, async (req, res, next) => {
  const id = req.params?.id;
  const { serviceDate, status } = req.body;
  const query = { _id: new ObjectId(id) };
  let updateField = {};
  if (serviceDate) updateField.serviceDate = serviceDate;
  if (status) updateField.status = status;

  try {
    const updateRes = await serviceOrderCollection.updateOne(query, {
      $set: updateField,
    });
    if (!updateRes?.modifiedCount) {
      return next({ status: 500, message: "Failed to update user order info" });
    }
    return res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
});

app.get("/service-order", verifyToken, async (req, res, next) => {
  const { user, fields } = req.query;
  let query = {};
  let projection = {};

  if (user) {
    query["email"] = user;
  }

  if (fields) {
    fields.split(",").forEach((field) => (projection[field] = 1));
  }

  try {
    const data = await serviceOrderCollection
      .find(query, { projection })
      .toArray();
    if (!data || !data.length > 0) {
      return next({ status: 404, message: "Service order info not found" });
    }
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

app.delete(`/service-order/:id`, verifyToken, async (req, res, next) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ success: false, message: "ID is required" });
  }

  // Validate ObjectId
  if (!ObjectId.isValid(id)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid ID format" });
  }

  const query = { _id: new ObjectId(id) };
  try {
    const orderRes = await serviceOrderCollection.deleteOne(query);
    if (!orderRes.deletedCount) {
      return next({
        status: 500,
        message: "Item not found or failed delete item for server error",
      });
    }
    return res.send({ success: true });
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

  // Remove this listening fn while host this server on production
  // app.listen(port, () =>
  //   console.log(`server running on http://localhost:${port}`)
  // );
};

startServer();

export default app;
