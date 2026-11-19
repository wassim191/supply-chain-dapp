// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract SupplyChain {
    address public owner;

    enum Role {
        None,
        Supplier,
        Manufacturer,
        Carrier,
        Distributor
    }
    enum Status {
        Created,
        Processed,
        InTransit,
        Delivered
    }
    struct Lot {
        uint256 id;
        string productName;
        uint256 quantity;
        string unit;
        string origin;
        Status status;
        uint256 createdAt;
        address creator;
        bool exists;
    }
    struct Step {
        string description;
        string location;
        uint256 timestamp;
        address actor;
        bytes32 documentHash;
        Status status;
    }
    uint256 public nextLotId = 1;

    mapping(address => Role) public roles;
    mapping(uint256 => Lot) private lots;
    mapping(uint256 => Step[]) private history;
    event RoleAssigned(address indexed actor, Role role);
    event LotCreated(
        uint256 indexed lotId,
        string productName,
        address indexed creator
    );
    event StepRecorded(
        uint256 indexed lotId,
        Status status,
        address indexed actor,
        string location,
        uint256 timestamp
    );
    modifier onlyOwner() {
        require(msg.sender == owner, "Owner only");
        _;
    }
    modifier onlyRole(Role expected) {
        require(roles[msg.sender] == expected, "Unauthorized role");
        _;
    }
    modifier lotExists(uint256 lotId) {
        require(lots[lotId].exists, "Lot does not exist");
        _;
    }
    constructor() {
        owner = msg.sender;
        roles[msg.sender] = Role.Supplier;
        emit RoleAssigned(msg.sender, Role.Supplier);
    }
    function assignRole(address actor, Role role) external onlyOwner {
        require(actor != address(0), "Invalid address");
        require(role != Role.None, "Invalid role");
        roles[actor] = role;
        emit RoleAssigned(actor, role);
    }
    function createLot(
        string calldata productName,
        uint256 quantity,
        string calldata unit,
        string calldata origin
    ) external onlyRole(Role.Supplier) returns (uint256) {
        require(bytes(productName).length > 0, "Empty name");
        require(quantity > 0, "Quantity must be positive");
        require(bytes(unit).length > 0, "Empty unit");
        uint256 lotId = nextLotId++;
        lots[lotId] = Lot({
            id: lotId,
            productName: productName,
            quantity: quantity,
            unit: unit,
            origin: origin,
            status: Status.Created,
            createdAt: block.timestamp,
            creator: msg.sender,
            exists: true
        });
        history[lotId].push(
            Step({
                description: "Lot created",
                location: origin,
                timestamp: block.timestamp,
                actor: msg.sender,
                documentHash: bytes32(0),
                status: Status.Created
            })
        );
        emit LotCreated(lotId, productName, msg.sender);
        emit StepRecorded(
            lotId,
            Status.Created,
            msg.sender,
            origin,
            block.timestamp
        );
        return lotId;
    }
    function recordStep(
        uint256 lotId,
        Status newStatus,
        string calldata description,
        string calldata location,
        bytes32 documentHash
    ) external lotExists(lotId) {
        Role role = roles[msg.sender];
        Status current = lots[lotId].status;

        require(bytes(description).length > 0, "Empty description");
        require(bytes(location).length > 0, "Empty location");
        if (newStatus == Status.Processed) {
            require(role == Role.Manufacturer, "Manufacturer only");
            require(current == Status.Created, "Invalid transition");
        } else if (newStatus == Status.InTransit) {
            require(role == Role.Carrier, "Carrier only");
            require(current == Status.Processed, "Invalid transition");
        } else if (newStatus == Status.Delivered) {
            require(role == Role.Distributor, "Distributor only");
            require(current == Status.InTransit, "Invalid transition");
        } else {
            revert("Invalid new status");
        }
        lots[lotId].status = newStatus;
        history[lotId].push(
            Step({
                description: description,
                location: location,
                timestamp: block.timestamp,
                actor: msg.sender,
                documentHash: documentHash,
                status: newStatus
            })
        );
        emit StepRecorded(
            lotId,
            newStatus,
            msg.sender,
            location,
            block.timestamp
        );
    }
    function getLot(
        uint256 lotId
    ) external view lotExists(lotId) returns (Lot memory) {
        return lots[lotId];
    }
    function getHistoryCount(
        uint256 lotId
    ) external view lotExists(lotId) returns (uint256) {
        return history[lotId].length;
    }
    function getHistoryStep(
        uint256 lotId,
        uint256 index
    ) external view lotExists(lotId) returns (Step memory) {
        require(index < history[lotId].length, "Invalid history index");
        return history[lotId][index];
    }
}
