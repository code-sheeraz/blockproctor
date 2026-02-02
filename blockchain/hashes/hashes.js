import { ethers } from "ethers";

const examData = JSON.stringify({ examId: 11, title: "CSET Demo" });
const attemptData = JSON.stringify({ student_id: 1, score: 100 });
const logData = JSON.stringify({ status: "MULTI_FACE", duration: "9m" });

const examHash = ethers.keccak256(ethers.toUtf8Bytes(examData));
const attemptHash = ethers.keccak256(ethers.toUtf8Bytes(attemptData));
const logHash = ethers.keccak256(ethers.toUtf8Bytes(logData));

console.log("Exam Hash:", examHash);
console.log("Attempt Hash:", attemptHash);
console.log("Log Hash:", logHash);
