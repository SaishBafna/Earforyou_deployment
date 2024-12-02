import User from "../models/Users";



export const watchUserChanges = () => {
  const changeStream = User.watch();

  changeStream.on("change", async (change) => {
    if (change.operationType === "update") {
      const updatedFields = change.updateDescription.updatedFields;

      if (updatedFields.userType === "RECEIVER") {
        try {
          const user = await User.findById(change.documentKey._id);
          if (user) {
            user.status = "Online";
            await user.save();
            console.log(`User ${user._id} is now Online (RECEIVER).`);
          }
        } catch (error) {
          console.error("Error updating user status:", error);
        }
      }
    }
  });

  changeStream.on("error", (error) => {
    console.error("Change stream error:", error);
  });
};
