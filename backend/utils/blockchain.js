const { ethers } = require("ethers");

const provider = new ethers.JsonRpcProvider("http://blockproctor-blockchain:8545");
let contract;

async function initContract() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const abi = [
    "function storeExam(string examId, string studentId, string resultHash) public",
    "function verifyExam(string examId) public view returns (string, string, string, uint256)"
  ];
  contract = new ethers.Contract(contractAddress, abi, provider.getSigner(0));
}

async function storeExamOnChain(examId, studentId, resultHash) {
  if (!contract) await initContract();
  return await contract.storeExam(examId, studentId, resultHash);
}

module.exports = { storeExamOnChain };
