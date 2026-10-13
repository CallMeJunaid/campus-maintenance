const express = require("express");
const { pool } = require("../config/db");
const {
  authenticateToken,
  allowRoles,
} = require("../middleware/auth");

const router = express.Router();

// All complaint endpoints require a valid JWT.
router.use(authenticateToken);

// POST /api/complaints
// Students and staff can submit complaints.
router.post(
  "/",
  allowRoles("student", "staff"),
  async (req, res) => {
    try {
      const { title, category, location, description, priority } = req.body;

      if (
        typeof title !== "string" ||
        !title.trim() ||
        typeof category !== "string" ||
        !category.trim() ||
        typeof location !== "string" ||
        !location.trim() ||
        typeof description !== "string" ||
        !description.trim()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Title, category, location and description are required.",
        });
      }

      if (
        title.trim().length > 200 ||
        category.trim().length > 100 ||
        location.trim().length > 200 ||
        description.trim().length > 5000
      ) {
        return res.status(400).json({
          success: false,
          message: "One or more fields exceed the allowed length.",
        });
      }

      const allowedPriorities = ["low", "medium", "high", "urgent"];
      const selectedPriority = priority ?? "medium";

      if (
        typeof selectedPriority !== "string" ||
        !allowedPriorities.includes(selectedPriority)
      ) {
        return res.status(400).json({
          success: false,
          message: "Priority must be low, medium, high or urgent.",
        });
      }

      const [result] = await pool.execute(
        `INSERT INTO complaints
          (user_id, title, category, location, description, priority, status)
         VALUES (?, ?, ?, ?, ?, ?, 'submitted')`,
        [
          req.user.id,
          title.trim(),
          category.trim(),
          location.trim(),
          description.trim(),
          selectedPriority,
        ]
      );

      return res.status(201).json({
        success: true,
        message: "Complaint submitted successfully.",
        complaint: {
          id: result.insertId,
          user_id: req.user.id,
          title: title.trim(),
          category: category.trim(),
          location: location.trim(),
          description: description.trim(),
          priority: selectedPriority,
          status: "submitted",
        },
      });
    } catch (error) {
      console.error("Create complaint error:", error.message);

      return res.status(500).json({
        success: false,
        message: "Could not submit complaint.",
      });
    }
  }
);

// GET /api/complaints
// Students and staff see their own complaints.
// Admins and technicians can see all complaints.
router.get("/", async (req, res) => {
  try {
    let query = `
      SELECT
        c.id,
        c.user_id,
        c.title,
        c.category,
        c.location,
        c.description,
        c.priority,
        c.status,
        c.image_key,
        c.created_at,
        c.updated_at
      FROM complaints c
    `;

    let params = [];

    if (["student", "staff"].includes(req.user.role)) {
      query += " WHERE c.user_id = ?";
      params.push(req.user.id);
    }

    query += " ORDER BY c.created_at DESC";

    const [complaints] = await pool.execute(query, params);

    return res.json({
      success: true,
      count: complaints.length,
      complaints,
    });
  } catch (error) {
    console.error("List complaints error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Could not retrieve complaints.",
    });
  }
});


 // GET /api/complaints/technicians
 // Only admins can retrieve the technician list.
router.get(
  "/technicians",
  allowRoles("admin"),
  async (req, res) => {
    try {
      const [technicians] = await pool.execute(
        `SELECT id, name, email
         FROM users
         WHERE role = 'technician'
         ORDER BY name ASC`
      );

      return res.json({
        success: true,
        technicians,
      });
    } catch (error) {
      console.error("Get technicians error:", error.message);

      return res.status(500).json({
        success: false,
        message: "Could not retrieve technicians.",
      });
    }
  }
);


// GET /api/complaints/:id
// Users can view their own complaint; admins and technicians can view any.
router.get("/:id", async (req, res) => {
  try {
    const complaintId = req.params.id;

    if (!/^[1-9]\d*$/.test(complaintId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid complaint ID.",
      });
    }

    const [rows] = await pool.execute(
      `SELECT
        c.id,
        c.user_id,
        c.title,
        c.category,
        c.location,
        c.description,
        c.priority,
        c.status,
        c.image_key,
        c.created_at,
        c.updated_at
       FROM complaints c
       WHERE c.id = ?`,
      [complaintId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found.",
      });
    }

    const complaint = rows[0];
    const canViewAll = ["admin", "technician"].includes(req.user.role);

    if (!canViewAll && complaint.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You cannot view this complaint.",
      });
    }

    return res.json({
      success: true,
      complaint,
    });
  } catch (error) {
    console.error("Get complaint error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Could not retrieve complaint.",
    });
  }
});

// POST /api/complaints/:id/assign
router.post(
  "/:id/assign",
  allowRoles("admin"),
  async (req, res) => {
    const complaintId = req.params.id;
    const { technician_id, remarks } = req.body;

    if (!/^[1-9]\d*$/.test(complaintId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid complaint ID.",
      });
    }

    if (
      !Number.isSafeInteger(technician_id) ||
      technician_id < 1 ||
      (remarks !== undefined &&
        (typeof remarks !== "string" || remarks.length > 1000))
    ) {
      return res.status(400).json({
        success: false,
        message: "Provide a valid technician_id and optional remarks.",
      });
    }

    let connection;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [complaints] = await connection.execute(
        "SELECT id FROM complaints WHERE id = ? FOR UPDATE",
        [complaintId]
      );

      if (!complaints.length) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: "Complaint not found.",
        });
      }

      const [technicians] = await connection.execute(
        "SELECT id FROM users WHERE id = ? AND role = 'technician'",
        [technician_id]
      );

      if (!technicians.length) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "The specified user is not a technician.",
        });
      }

      await connection.execute(
        `INSERT INTO complaint_assignments
          (complaint_id, technician_id, assigned_by, remarks)
         VALUES (?, ?, ?, ?)`,
        [
          Number(complaintId),
          technician_id,
          req.user.id,
          remarks?.trim() || null,
        ]
      );

      await connection.execute(
        `UPDATE complaints
         SET status = 'assigned', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [complaintId]
      );

      await connection.commit();

      return res.status(200).json({
        success: true,
        message: "Complaint assigned successfully.",
        complaint_id: Number(complaintId),
        technician_id,
        status: "assigned",
      });
    } catch (error) {
      if (connection) await connection.rollback();

      console.error("Assign complaint error:", error.message);

      return res.status(500).json({
        success: false,
        message: "Could not assign complaint.",
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

// PATCH /api/complaints/:id/status
router.patch(
  "/:id/status",
  allowRoles("admin", "technician"),
  async (req, res) => {
    const complaintId = req.params.id;
    const { status } = req.body;

    const allowedStatuses = [
      "assigned",
      "in_progress",
      "resolved",
      "closed",
    ];

    if (!/^[1-9]\d*$/.test(complaintId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid complaint ID.",
      });
    }

    if (
      typeof status !== "string" ||
      !allowedStatuses.includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Status must be assigned, in_progress, resolved or closed.",
      });
    }

    let connection;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [complaints] = await connection.execute(
        "SELECT id, status FROM complaints WHERE id = ? FOR UPDATE",
        [complaintId]
      );

      if (!complaints.length) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: "Complaint not found.",
        });
      }

      // Technicians may update only complaints assigned to them.
      if (req.user.role === "technician") {
        const [assignments] = await connection.execute(
          `SELECT complaint_id
           FROM complaint_assignments
           WHERE complaint_id = ? AND technician_id = ?
           LIMIT 1`,
          [complaintId, req.user.id]
        );

        if (!assignments.length) {
          await connection.rollback();
          return res.status(403).json({
            success: false,
            message: "This complaint is not assigned to you.",
          });
        }
      }

      await connection.execute(
        `UPDATE complaints
         SET status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [status, complaintId]
      );

      await connection.commit();

      return res.json({
        success: true,
        message: "Complaint status updated successfully.",
        complaint_id: Number(complaintId),
        previous_status: complaints[0].status,
        status,
      });
    } catch (error) {
      if (connection) await connection.rollback();

      console.error("Update complaint status error:", error.message);

      return res.status(500).json({
        success: false,
        message: "Could not update complaint status.",
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

module.exports = router;