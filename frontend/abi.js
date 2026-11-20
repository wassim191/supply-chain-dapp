// Human-readable ABI for SupplyChain.sol (ethers v6 format).
// Enums (Role, Status) are encoded as uint8 in the ABI.
// If you change the contract, update this file (or replace it with the ABI exported by Remix).
window.SUPPLY_CHAIN_ABI = [
  "function owner() view returns (address)",
  "function nextLotId() view returns (uint256)",
  "function roles(address) view returns (uint8)",

  "function assignRole(address actor, uint8 role)",
  "function createLot(string productName, uint256 quantity, string unit, string origin) returns (uint256)",
  "function recordStep(uint256 lotId, uint8 newStatus, string description, string location, bytes32 documentHash)",

  "function getLot(uint256 lotId) view returns (tuple(uint256 id, string productName, uint256 quantity, string unit, string origin, uint8 status, uint256 createdAt, address creator, bool exists))",
  "function getHistoryCount(uint256 lotId) view returns (uint256)",
  "function getHistoryStep(uint256 lotId, uint256 index) view returns (tuple(string description, string location, uint256 timestamp, address actor, bytes32 documentHash, uint8 status))",

  "event RoleAssigned(address indexed actor, uint8 role)",
  "event LotCreated(uint256 indexed lotId, string productName, address indexed creator)",
  "event StepRecorded(uint256 indexed lotId, uint8 status, address indexed actor, string location, uint256 timestamp)"
];
