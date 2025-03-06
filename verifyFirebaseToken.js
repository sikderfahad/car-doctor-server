import admin from "firebase-admin";

// Middleware to verify Firebase ID token
const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: No token provided" });
  }

  const token = authHeader.split(" ")[1]; // Extract token after "Bearer "
  // console.log("bearer token: ", token);

  try {
    // Verify token and get decoded user info
    const decodedToken = await admin.auth().verifyIdToken(token);
    // console.log("token from firebase: ", decodedToken);
    req.firebaseUser = decodedToken; // Attach decoded user info to request
    next(); // Proceed to next middleware
  } catch (error) {
    console.error("Token verification failed:", error);
    return res
      .status(403)
      .json({ error: "Forbidden: Invalid or expired token" });
  }
};

export default verifyFirebaseToken;
