import { firestoreDb } from "./index.js";

const verifyAdmin = async (req, res, next) => {
  try {
    if (!req.firebaseUser || !req.firebaseUser.uid) {
      return res.status(401).json({ message: "Unauthorized: No valid token" });
    }

    const requestingUid = req.firebaseUser.uid; // Get from verified token

    const requestingUserRef = firestoreDb
      .collection("users")
      .doc(requestingUid);

    const requestingUserSnap = await requestingUserRef.get();

    if (
      !requestingUserSnap.exists ||
      requestingUserSnap.data().role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: Only admins can update roles",
      });
    }
    next();
  } catch (err) {
    return res.status(500).json({ message: "Internal server error" });
  }
};

export default verifyAdmin;
