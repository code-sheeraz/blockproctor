// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ExamRecord {
    struct Record {
        string studentName;
        string courseName;
        uint256 score;
        uint256 timestamp;
    }

    mapping(address => Record[]) public records;

    event RecordAdded(address indexed student, string course, uint256 score, uint256 timestamp);

    function addRecord(string memory studentName, string memory courseName, uint256 score) public {
        records[msg.sender].push(Record(studentName, courseName, score, block.timestamp));
        emit RecordAdded(msg.sender, courseName, score, block.timestamp);
    }

    function getRecords(address student) public view returns (Record[] memory) {
        return records[student];
    }
}
