// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Lock {
    uint256 public unlockTime;
    address payable public owner;

    event Withdrawal(uint256 amount, uint256 when);

    constructor(uint256 _unlockTime) payable {
        require(block.timestamp < _unlockTime, "Unlock time must be future");
        unlockTime = _unlockTime;
        owner = payable(msg.sender);
    }

    function withdraw() public {
        require(block.timestamp >= unlockTime, "Too early");
        require(msg.sender == owner, "Not owner");
        emit Withdrawal(address(this).balance, block.timestamp);
        owner.transfer(address(this).balance);
    }

    // --- NEW BLOCKCHAIN INTEGRITY FEATURES ---
   string public examHash;
string public attemptHash;
string public logHash;

function setExamHash(string memory _hash) public {
  examHash = _hash;
}

function setAttemptHash(string memory _hash) public {
  attemptHash = _hash;
}

function setLogHash(string memory _hash) public {
  logHash = _hash;
}

// ✅ ADD THESE 3 GETTERS
function getExamHash() public view returns (string memory) {
  return examHash;
}

function getAttemptHash() public view returns (string memory) {
  return attemptHash;
}

function getLogHash() public view returns (string memory) {
  return logHash;
}
}