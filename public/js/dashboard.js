const token = localStorage.getItem("campusToken");
const pageMessage = document.getElementById("pageMessage");
const complaintList = document.getElementById("complaintList");
const complaintForm = document.getElementById("complaintForm");
const complaintSubmit = document.getElementById("complaintSubmit");

let currentUser = null;
let technicians = [];

if (!token) {
  window.location.replace("/login.html");
}

function showPageMessage(message, type = "error") {
  pageMessage.textContent = message;
  pageMessage.className = `message ${type}`;
  pageMessage.hidden = false;
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    localStorage.removeItem("campusToken");
    window.location.replace("/login.html");
    throw new Error("Your session has expired. Please sign in again.");
  }

  if (!response.ok) {
    throw new Error(data.message || "The request failed.");
  }

  return data;
}

document.getElementById("logoutButton").addEventListener("click", () => {
  localStorage.removeItem("campusToken");
  window.location.replace("/login.html");
});

function addTextElement(parent, tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text ?? "";
  parent.appendChild(element);
  return element;
}

function formatStatus(status) {
  return status.replaceAll("_", " ");
}

function renderComplaint(complaint) {
  const card = document.createElement("article");
  card.className = "complaint-card";

  const top = document.createElement("div");
  top.className = "complaint-top";

  const titleBlock = document.createElement("div");
  addTextElement(titleBlock, "h3", "complaint-title", complaint.title);
  addTextElement(
    titleBlock,
    "p",
    "complaint-meta",
    `#${complaint.id} · ${complaint.category} · ${complaint.location}`
  );

  const status = addTextElement(
    top,
    "span",
    `status-badge status-${complaint.status}`,
    formatStatus(complaint.status)
  );

  top.appendChild(titleBlock);
  card.appendChild(top);

  addTextElement(card, "p", "complaint-description", complaint.description);

  const bottom = document.createElement("div");
  bottom.className = "complaint-bottom";

  const priority = document.createElement("span");
  priority.className = `priority priority-${complaint.priority}`;
  priority.textContent = `Priority: ${complaint.priority}`;
  bottom.appendChild(priority);

  const created = complaint.created_at
    ? new Date(complaint.created_at).toLocaleString()
    : "Date unavailable";

  addTextElement(bottom, "span", "muted small-text", `Created: ${created}`);
  card.appendChild(bottom);

  if (currentUser && ["admin", "technician"].includes(currentUser.role)) {
    const controls = document.createElement("div");
    controls.className = "status-controls";

    const select = document.createElement("select");
    select.setAttribute("aria-label", `Update status for complaint ${complaint.id}`);

    const statuses = ["assigned", "in_progress", "resolved", "closed"];

    statuses.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = formatStatus(value);
      option.selected = value === complaint.status;
      select.appendChild(option);
    });

    const updateButton = document.createElement("button");
    updateButton.type = "button";
    updateButton.className = "button button-secondary";
    updateButton.textContent = "Update status";

    updateButton.addEventListener("click", async () => {
      updateButton.disabled = true;

      try {
        await apiRequest(`/api/complaints/${complaint.id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: select.value }),
        });

        showPageMessage("Complaint status updated.", "success");
        await loadComplaints();
      } catch (error) {
        showPageMessage(error.message);
      } finally {
        updateButton.disabled = false;
      }
    });

    controls.appendChild(select);
    controls.appendChild(updateButton);
    card.appendChild(controls);
  }

  
  // Admin-only complaint assignment controls
  if (currentUser && currentUser.role === "admin") {
    const assignControls = document.createElement("div");
    assignControls.className = "status-controls";

    const technicianSelect = document.createElement("select");
    technicianSelect.setAttribute(
      "aria-label",
      `Select technician for complaint ${complaint.id}`
    );

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select a technician";
    technicianSelect.appendChild(placeholder);

    technicians.forEach((technician) => {
      const option = document.createElement("option");
      option.value = technician.id;
      option.textContent =
        `${technician.name} (${technician.email})`;
      technicianSelect.appendChild(option);
    });

    const assignButton = document.createElement("button");
    assignButton.type = "button";
    assignButton.className = "button button-secondary";
    assignButton.textContent = "Assign Technician";

    assignButton.addEventListener("click", async () => {
      const technicianId = Number(technicianSelect.value);

      if (!Number.isSafeInteger(technicianId) || technicianId < 1) {
        showPageMessage("Please select a technician.");
        return;
      }

      assignButton.disabled = true;

      try {
        await apiRequest(`/api/complaints/${complaint.id}/assign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            technician_id: technicianId,
          }),
        });

        showPageMessage(
          `Complaint #${complaint.id} assigned successfully.`,
          "success"
        );

        await loadComplaints();
      } catch (error) {
        showPageMessage(error.message);
      } finally {
        assignButton.disabled = false;
      }
    });

    assignControls.appendChild(technicianSelect);
    assignControls.appendChild(assignButton);
    card.appendChild(assignControls);
  }


  return card;
}

async function loadComplaints() {
  complaintList.replaceChildren();
  addTextElement(complaintList, "p", "muted", "Loading complaints...");

  try {
    const data = await apiRequest("/api/complaints");
    complaintList.replaceChildren();

    if (!data.complaints || data.complaints.length === 0) {
      addTextElement(
        complaintList,
        "p",
        "empty-state",
        "No complaints yet. Submit your first maintenance request above."
      );
      return;
    }

    data.complaints.forEach((complaint) => {
      complaintList.appendChild(renderComplaint(complaint));
    });
  } catch (error) {
    complaintList.replaceChildren();
    addTextElement(complaintList, "p", "message error", error.message);
  }
}

complaintForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  complaintSubmit.disabled = true;

  const body = {
    title: document.getElementById("title").value.trim(),
    category: document.getElementById("category").value,
    location: document.getElementById("location").value.trim(),
    priority: document.getElementById("priority").value,
    description: document.getElementById("description").value.trim(),
  };

  try {
    await apiRequest("/api/complaints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    complaintForm.reset();
    document.getElementById("priority").value = "medium";
    showPageMessage("Complaint submitted successfully.", "success");
    await loadComplaints();
  } catch (error) {
    showPageMessage(error.message);
  } finally {
    complaintSubmit.disabled = false;
  }
});

document.getElementById("refreshButton").addEventListener("click", loadComplaints);

async function initializeDashboard() {
  try {
    const data = await apiRequest("/api/me");
    currentUser = data.user;

    document.getElementById("userName").textContent =
      `Welcome, ${currentUser.name || currentUser.email || "User"}`;

    document.getElementById("roleBadge").textContent = currentUser.role;

    // The current complaint-creation route permits students and staff.
    // Admins and technicians use the dashboard to manage existing requests.
    if (!["student", "staff"].includes(currentUser.role)) {
      document.getElementById("submitSection").hidden = true;
    }

    if (currentUser.role === "admin") {
  const data = await apiRequest("/api/complaints/technicians");
  technicians = data.technicians;
}

await loadComplaints();

  } catch (error) {
    if (localStorage.getItem("campusToken")) {
      showPageMessage(error.message);
    }
  }
}

if (token) {
  initializeDashboard();
}