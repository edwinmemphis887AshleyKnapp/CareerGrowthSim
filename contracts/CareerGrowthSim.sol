// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract CareerGrowthSim is SepoliaConfig {
    struct EncryptedIDP {
        uint256 id;
        euint32 encryptedSkillLevel;      // Current skill level
        euint32 encryptedLearningHours;   // Planned learning hours
        euint32 encryptedProjectImpact;    // Project impact score
        euint32 encryptedCareerGoal;       // Career goal level
        uint256 timestamp;
    }
    
    struct DecryptedIDP {
        uint32 skillLevel;
        uint32 learningHours;
        uint32 projectImpact;
        uint32 careerGoal;
        bool isRevealed;
    }

    struct SimulationResult {
        euint32 encryptedGrowthScore;
        uint32 decryptedGrowthScore;
        bool isCalculated;
    }

    uint256 public idpCount;
    mapping(uint256 => EncryptedIDP) public encryptedIDPs;
    mapping(uint256 => DecryptedIDP) public decryptedIDPs;
    mapping(uint256 => SimulationResult) public simulationResults;
    
    mapping(uint256 => uint256) private requestToIdpId;
    
    event IDPSubmitted(uint256 indexed id, uint256 timestamp);
    event DecryptionRequested(uint256 indexed id);
    event IDPDecrypted(uint256 indexed id);
    event SimulationCompleted(uint256 indexed idpId, uint256 timestamp);
    
    modifier onlyOwner(uint256 idpId) {
        _;
    }
    
    function submitEncryptedIDP(
        euint32 encryptedSkillLevel,
        euint32 encryptedLearningHours,
        euint32 encryptedProjectImpact,
        euint32 encryptedCareerGoal
    ) public {
        idpCount += 1;
        uint256 newId = idpCount;
        
        encryptedIDPs[newId] = EncryptedIDP({
            id: newId,
            encryptedSkillLevel: encryptedSkillLevel,
            encryptedLearningHours: encryptedLearningHours,
            encryptedProjectImpact: encryptedProjectImpact,
            encryptedCareerGoal: encryptedCareerGoal,
            timestamp: block.timestamp
        });
        
        decryptedIDPs[newId] = DecryptedIDP({
            skillLevel: 0,
            learningHours: 0,
            projectImpact: 0,
            careerGoal: 0,
            isRevealed: false
        });
        
        emit IDPSubmitted(newId, block.timestamp);
    }
    
    function requestIDPDecryption(uint256 idpId) public onlyOwner(idpId) {
        EncryptedIDP storage idp = encryptedIDPs[idpId];
        require(!decryptedIDPs[idpId].isRevealed, "Already decrypted");
        
        bytes32[] memory ciphertexts = new bytes32[](4);
        ciphertexts[0] = FHE.toBytes32(idp.encryptedSkillLevel);
        ciphertexts[1] = FHE.toBytes32(idp.encryptedLearningHours);
        ciphertexts[2] = FHE.toBytes32(idp.encryptedProjectImpact);
        ciphertexts[3] = FHE.toBytes32(idp.encryptedCareerGoal);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptIDP.selector);
        requestToIdpId[reqId] = idpId;
        
        emit DecryptionRequested(idpId);
    }
    
    function decryptIDP(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 idpId = requestToIdpId[requestId];
        require(idpId != 0, "Invalid request");
        
        EncryptedIDP storage eIDP = encryptedIDPs[idpId];
        DecryptedIDP storage dIDP = decryptedIDPs[idpId];
        require(!dIDP.isRevealed, "Already decrypted");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        uint32[] memory results = abi.decode(cleartexts, (uint32[]));
        
        dIDP.skillLevel = results[0];
        dIDP.learningHours = results[1];
        dIDP.projectImpact = results[2];
        dIDP.careerGoal = results[3];
        dIDP.isRevealed = true;
        
        emit IDPDecrypted(idpId);
    }
    
    function runEncryptedSimulation(uint256 idpId) public onlyOwner(idpId) {
        EncryptedIDP storage idp = encryptedIDPs[idpId];
        require(!simulationResults[idpId].isCalculated, "Simulation already run");
        
        // Growth score formula: (skill * 2 + learningHours + projectImpact * 3) / 6
        euint32 growthScore = FHE.div(
            FHE.add(
                FHE.add(
                    FHE.mul(idp.encryptedSkillLevel, FHE.asEuint32(2)),
                    idp.encryptedLearningHours
                ),
                FHE.mul(idp.encryptedProjectImpact, FHE.asEuint32(3))
            ),
            FHE.asEuint32(6)
        );
        
        simulationResults[idpId] = SimulationResult({
            encryptedGrowthScore: growthScore,
            decryptedGrowthScore: 0,
            isCalculated: true
        });
        
        emit SimulationCompleted(idpId, block.timestamp);
    }
    
    function requestSimulationDecryption(uint256 idpId) public onlyOwner(idpId) {
        SimulationResult storage result = simulationResults[idpId];
        require(result.isCalculated, "Simulation not run");
        require(result.decryptedGrowthScore == 0, "Already decrypted");
        
        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(result.encryptedGrowthScore);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptSimulation.selector);
        requestToIdpId[reqId] = idpId;
    }
    
    function decryptSimulation(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 idpId = requestToIdpId[requestId];
        require(idpId != 0, "Invalid request");
        
        SimulationResult storage result = simulationResults[idpId];
        require(result.decryptedGrowthScore == 0, "Already decrypted");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        uint32 score = abi.decode(cleartexts, (uint32));
        result.decryptedGrowthScore = score;
    }
    
    function getDecryptedIDP(uint256 idpId) public view returns (
        uint32 skillLevel,
        uint32 learningHours,
        uint32 projectImpact,
        uint32 careerGoal,
        bool isRevealed
    ) {
        DecryptedIDP storage idp = decryptedIDPs[idpId];
        return (idp.skillLevel, idp.learningHours, idp.projectImpact, idp.careerGoal, idp.isRevealed);
    }
    
    function getSimulationResult(uint256 idpId) public view returns (
        uint32 growthScore,
        bool isCalculated
    ) {
        SimulationResult storage result = simulationResults[idpId];
        return (result.decryptedGrowthScore, result.isCalculated);
    }
    
    function compareWithGoal(uint256 idpId) public view returns (ebool) {
        require(simulationResults[idpId].isCalculated, "Simulation not run");
        EncryptedIDP storage idp = encryptedIDPs[idpId];
        
        return FHE.gt(
            simulationResults[idpId].encryptedGrowthScore,
            idp.encryptedCareerGoal
        );
    }
    
    function requestComparisonDecryption(uint256 idpId) public onlyOwner(idpId) {
        require(simulationResults[idpId].isCalculated, "Simulation not run");
        
        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(compareWithGoal(idpId));
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptComparison.selector);
        requestToIdpId[reqId] = idpId;
    }
    
    function decryptComparison(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public returns (bool) {
        uint256 idpId = requestToIdpId[requestId];
        require(idpId != 0, "Invalid request");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        return abi.decode(cleartexts, (bool));
    }
}