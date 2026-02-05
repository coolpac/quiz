import { Router } from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import sharp from "sharp";
import { validateTelegramInitData } from "../middleware/auth";
import { adminOnly } from "../middleware/adminOnly";

const router = Router();

router.use(validateTelegramInitData);
router.use(adminOnly);

const uploadDir = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) {
      cb(null, true);
      return;
    }
    cb(new Error("Unsupported file type"));
  },
});

router.post("/media", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "File is required" });
    return;
  }

  try {
    const forwardedProto = (req.headers["x-forwarded-proto"] as string | undefined)
      ?.split(",")[0]
      ?.trim();
    const protocol = forwardedProto || req.protocol;
    const host = req.get("host") ?? "";
    const isVideo = file.mimetype.startsWith("video/");
    const baseName = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const extension = isVideo
      ? (path.extname(file.originalname).toLowerCase() ||
          `.${file.mimetype.split("/")[1] ?? "mp4"}`)
      : ".webp";
    const filename = `${baseName}${extension}`;
    const outputPath = path.join(uploadDir, filename);

    if (isVideo) {
      await fs.promises.writeFile(outputPath, file.buffer);
    } else {
      const optimized = await sharp(file.buffer)
        .rotate()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .toFormat("webp", { quality: 82 })
        .toBuffer();
      await fs.promises.writeFile(outputPath, optimized);
    }

    const url = `${protocol}://${host}/uploads/${filename}`;
    const mediaType = isVideo ? "video" : "image";

    res.json({ url, mediaType, filename });
  } catch (error) {
    res.status(500).json({ error: "Upload failed" });
  }
});

export default router;
