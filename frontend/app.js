(() => {
  const CONFIG = window.APP_CONFIG;
  const STATUS_NAMES = ["Created", "Processed", "In transit", "Delivered"];
  const ROLE_NAMES = ["None", "Supplier", "Manufacturer", "Carrier", "Distributor"];
  const EMPTY_HASH = "0x" + "00".repeat(32);

  let provider;
  let signer;
  let contract;

  const $ = (id) => document.getElementById(id);

  function setMessage(text, isError = false) {
    const el = $("message");
    el.textContent = text;
    el.className = isError ? "error" : "ok";
  }

  async function run(action) {
    try {
      await action();
    } catch (error) {
      setMessage(error.shortMessage || error.reason || error.message, true);
    }
  }

  function requireContract() {
    if (!contract) {
      throw new Error("Connect your wallet first.");
    }
  }

  function parsePositiveInt(value, label) {
    const text = value.trim();
    if (!/^[1-9]\d*$/.test(text)) {
      throw new Error(label + " must be a positive whole number.");
    }
    return BigInt(text);
  }

  function formatDate(timestamp) {
    return new Date(Number(timestamp) * 1000).toLocaleString("en-GB");
  }

  // ---- Wallet connection ----

  async function connectWallet() {
    if (!window.ethereum) {
      throw new Error("MetaMask is not installed or not available in this browser.");
    }
    if (CONFIG.CONTRACT_ADDRESS.startsWith("PASTE_")) {
      throw new Error("Set CONTRACT_ADDRESS in config.js first.");
    }

    await window.ethereum.request({ method: "eth_requestAccounts" });

    provider = new ethers.BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();
    if (network.chainId !== CONFIG.CHAIN_ID) {
      throw new Error("Please switch MetaMask to " + CONFIG.NETWORK_NAME + ".");
    }

    signer = await provider.getSigner();
    contract = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, window.SUPPLY_CHAIN_ABI, signer);

    const address = await signer.getAddress();
    const role = Number(await contract.roles(address));

    $("account").textContent = "Account: " + address;
    $("network").textContent = "Network: " + CONFIG.NETWORK_NAME;
    $("role").textContent = "Role: " + ROLE_NAMES[role];

    window.ethereum.on("accountsChanged", () => window.location.reload());
    window.ethereum.on("chainChanged", () => window.location.reload());
  }

  // ---- Reading a lot ----

  function addRow(table, label, value) {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    const td = document.createElement("td");
    th.textContent = label;
    td.textContent = value;
    tr.append(th, td);
    table.append(tr);
  }

  async function lookupLot() {
    requireContract();
    const lotId = parsePositiveInt($("lotId").value, "Lot ID");
    const started = performance.now();

    const lot = await contract.getLot(lotId);
    const count = Number(await contract.getHistoryCount(lotId));

    // textContent is used everywhere so that data coming from the blockchain
    // is never interpreted as HTML.
    const table = document.createElement("table");
    addRow(table, "ID", lot.id.toString());
    addRow(table, "Product", lot.productName);
    addRow(table, "Quantity", lot.quantity.toString() + " " + lot.unit);
    addRow(table, "Origin", lot.origin);
    addRow(table, "Status", STATUS_NAMES[Number(lot.status)]);
    addRow(table, "Created", formatDate(lot.createdAt));
    addRow(table, "Creator", lot.creator);
    $("lotResult").replaceChildren(table);

    const items = [];
    for (let i = 0; i < count; i++) {
      const step = await contract.getHistoryStep(lotId, i);
      const li = document.createElement("li");
      const hasDocument = step.documentHash !== EMPTY_HASH;
      li.textContent =
        STATUS_NAMES[Number(step.status)] + " – " + step.description +
        " (" + step.location + ") – " + formatDate(step.timestamp) +
        " – by " + step.actor +
        (hasDocument ? " – document hash: " + step.documentHash : "");
      items.push(li);
    }
    $("history").replaceChildren(...items);

    setMessage(
      "Lot " + lotId.toString() + " loaded (" + count + " steps) in " +
      Math.round(performance.now() - started) + " ms."
    );
  }

  // ---- Creating a lot ----

  function lotIdFromReceipt(receipt) {
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== CONFIG.CONTRACT_ADDRESS.toLowerCase()) {
        continue;
      }
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed && parsed.name === "LotCreated") {
          return parsed.args.lotId;
        }
      } catch (_) {
        // not an event of this contract's ABI, ignore
      }
    }
    return null;
  }

  async function createLot() {
    requireContract();

    const productName = $("productName").value.trim();
    const unit = $("unit").value.trim();
    const origin = $("origin").value.trim();
    const quantity = parsePositiveInt($("quantity").value, "Quantity");

    if (!productName || !unit || !origin) {
      throw new Error("Product name, unit and origin are required.");
    }

    const tx = await contract.createLot(productName, quantity, unit, origin);
    const sentAt = performance.now();
    setMessage("Transaction sent: " + tx.hash + " (waiting for confirmation...)");

    const receipt = await tx.wait();
    const seconds = ((performance.now() - sentAt) / 1000).toFixed(1);
    const lotId = lotIdFromReceipt(receipt);

    setMessage(
      (lotId !== null ? "Lot " + lotId.toString() + " created. " : "Lot created. ") +
      "Transaction: " + receipt.hash +
      " (confirmed in " + seconds + " s, gas used: " + receipt.gasUsed.toString() + ")"
    );

    if (lotId !== null) {
      $("lotId").value = lotId.toString();
      $("stepLotId").value = lotId.toString();
    }
  }

  // ---- Recording a step ----

  async function recordStep() {
    requireContract();

    const lotId = parsePositiveInt($("stepLotId").value, "Lot ID");
    const status = Number($("stepStatus").value);
    const description = $("description").value.trim();
    const location = $("location").value.trim();
    const hashInput = $("documentHash").value.trim();

    if (!description || !location) {
      throw new Error("Description and location are required.");
    }
    if (hashInput && !/^0x[0-9a-fA-F]{64}$/.test(hashInput)) {
      throw new Error("Document hash must be 0x followed by 64 hexadecimal characters.");
    }

    const tx = await contract.recordStep(
      lotId, status, description, location, hashInput || EMPTY_HASH
    );
    const sentAt = performance.now();
    setMessage("Transaction sent: " + tx.hash + " (waiting for confirmation...)");

    const receipt = await tx.wait();
    const seconds = ((performance.now() - sentAt) / 1000).toFixed(1);
    setMessage(
      "Step confirmed. Transaction: " + receipt.hash +
      " (confirmed in " + seconds + " s, gas used: " + receipt.gasUsed.toString() + ")"
    );
  }

  // ---- Wiring ----

  $("connect").addEventListener("click", () =>
    run(async () => {
      await connectWallet();
      setMessage("Wallet connected.");
    })
  );
  $("lookup").addEventListener("click", () => run(lookupLot));
  $("createLot").addEventListener("click", () => run(createLot));
  $("recordStep").addEventListener("click", () => run(recordStep));
})();
