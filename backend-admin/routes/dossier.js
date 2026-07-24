const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");

const {
  getDossiers,
  validateDossier,
  updateEtape,
  marquerContratSigne,
  updateFinance,
  cloreDossier,
  annulerDossier,
  deleteDossier,
} = require("../controllers/dossierController");

const { protect, admin } = require("../middlewares/auth");
const { checkSessionTimeout } = require("../middlewares/sessionTimeout");

// Config multer pour upload contrat signé
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/contrats/");
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `contrat-${req.params.id}-${Date.now()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  // Accept more real-world browser mimetypes for PDFs
  const allowed = [
    "application/pdf",
    "application/x-pdf",
    "application/octet-stream",
    "image/jpeg",
    "image/png",
  ];

  // When mimetype is unreliable, also fallback to extension
  const ext = path.extname(file.originalname || "").toLowerCase();
  const extAllowed = [".pdf", ".jpg", ".jpeg", ".png"].includes(ext);

  if (allowed.includes(file.mimetype) || extAllowed) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Format non autorisé. Formats acceptés : PDF, JPG, PNG (≤ 10MB).",
      ),
      false,
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
});

// Middlewares globaux
router.use(protect);
router.use(admin);
router.use(checkSessionTimeout);

// Routes
router.get("/", getDossiers);
router.patch("/validate/:id", validateDossier);
router.patch("/clore/:id", cloreDossier);
router.patch("/annuler/:id", annulerDossier);
router.patch("/:id/etape", updateEtape);
router.patch(
  "/:id/contrat-signe",
  upload.single("contratSignePdf"),
  marquerContratSigne,
);
router.put("/:id/finance", updateFinance);
router.delete("/:id", deleteDossier);

module.exports = router;
