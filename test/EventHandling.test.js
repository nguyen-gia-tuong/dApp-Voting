/**
 * EventHandling.test.js
 * Test chuyên biệt cho Event Handling — dApp Voting
 *
 * Kiểm thử tất cả 6 events trong Voting.sol:
 *   1. votedEvent
 *   2. CandidateAdded
 *   3. CandidateRemoved
 *   4. VotingTimeSet
 *   5. VoterWhitelisted
 *   6. VoterRemovedFromWhitelist
 */

import { expect } from "chai";
import { network } from "hardhat";

describe("===== EVENT HANDLING — dApp Voting =====", function () {
  let voting;
  let owner, voter1, voter2, voter3;
  let ethers;

  beforeEach(async function () {
    const connection = await network.connect();
    ethers = connection.ethers;

    [owner, voter1, voter2, voter3] = await ethers.getSigners();

    const Voting = await ethers.getContractFactory("Voting");
    voting = await Voting.deploy();
  });

  // ═══════════════════════════════════════════════════════
  // NHÓM 1: votedEvent
  // ═══════════════════════════════════════════════════════
  describe("1. votedEvent", function () {
    it("1a. Phát ra votedEvent đúng candidateId khi bỏ phiếu thành công", async function () {
      await expect(voting.connect(voter1).vote(1))
        .to.emit(voting, "votedEvent")
        .withArgs(1n);
    });

    it("1b. Phát ra votedEvent đúng cho nhiều ứng viên khác nhau", async function () {
      await expect(voting.connect(voter1).vote(2))
        .to.emit(voting, "votedEvent")
        .withArgs(2n);

      await expect(voting.connect(voter2).vote(5))
        .to.emit(voting, "votedEvent")
        .withArgs(5n);
    });

    it("1c. KHÔNG phát ra votedEvent khi bỏ phiếu lần 2 (đã vote rồi)", async function () {
      await voting.connect(voter1).vote(1);

      await expect(
        voting.connect(voter1).vote(1)
      ).to.be.revertedWith("Voting: ban da bo phieu roi");
    });

    it("1d. KHÔNG phát ra votedEvent khi candidateId không hợp lệ", async function () {
      await expect(
        voting.connect(voter1).vote(99)
      ).to.be.revertedWith("Voting: id ung vien khong hop le");
    });

    it("1e. Đọc lại lịch sử event votedEvent bằng queryFilter", async function () {
      // Bỏ phiếu 3 lần từ 3 tài khoản khác nhau
      await voting.connect(voter1).vote(1);
      await voting.connect(voter2).vote(3);
      await voting.connect(voter3).vote(5);

      // Query tất cả votedEvent từ block 0
      const filter = voting.filters.votedEvent();
      const events = await voting.queryFilter(filter, 0, "latest");

      // Constructor emit 5 CandidateAdded, không emit votedEvent
      // => Phải đúng 3 votedEvent
      expect(events.length).to.equal(3);

      // Kiểm tra từng event
      expect(events[0].args[0]).to.equal(1n); // voter1 → candidate 1
      expect(events[1].args[0]).to.equal(3n); // voter2 → candidate 3
      expect(events[2].args[0]).to.equal(5n); // voter3 → candidate 5

      console.log("\n  📋 Lịch sử votedEvent:");
      for (const ev of events) {
        console.log(
          `     Block #${ev.blockNumber} | candidateId = ${ev.args[0]} | tx = ${ev.transactionHash.slice(0, 18)}...`
        );
      }
    });

    it("1f. Query votedEvent theo candidateId cụ thể (indexed filter)", async function () {
      await voting.connect(voter1).vote(1);
      await voting.connect(voter2).vote(2);
      await voting.connect(voter3).vote(1);

      // Chỉ lọc vote cho ứng viên 1
      const filter = voting.filters.votedEvent(1n);
      const events = await voting.queryFilter(filter, 0, "latest");

      expect(events.length).to.equal(2); // voter1 và voter3 đều vote cho ứng viên 1

      console.log("\n  📋 votedEvent chỉ cho candidate #1:");
      for (const ev of events) {
        console.log(`     Block #${ev.blockNumber} | candidateId = ${ev.args[0]}`);
      }
    });
  });

  // ═══════════════════════════════════════════════════════
  // NHÓM 2: CandidateAdded
  // ═══════════════════════════════════════════════════════
  describe("2. CandidateAdded", function () {
    it("2a. Phát ra CandidateAdded trong constructor (5 ứng viên mặc định)", async function () {
      const filter = voting.filters.CandidateAdded();
      const events = await voting.queryFilter(filter, 0, "latest");

      // Constructor add 5 ứng viên => 5 events
      expect(events.length).to.equal(5);

      console.log("\n  📋 CandidateAdded từ constructor:");
      for (const ev of events) {
        console.log(`     id=${ev.args[0]} | name="${ev.args[1]}"`);
      }
    });

    it("2b. Phát ra CandidateAdded đúng id và name khi owner thêm ứng viên mới", async function () {
      await expect(voting.connect(owner).addCandidate("Ung Vien Moi"))
        .to.emit(voting, "CandidateAdded")
        .withArgs(6n, "Ung Vien Moi");
    });

    it("2c. KHÔNG phát ra CandidateAdded khi non-owner thêm ứng viên", async function () {
      await expect(
        voting.connect(voter1).addCandidate("Hacker")
      ).to.be.revertedWith("Voting: chi owner moi duoc thuc hien");
    });

    it("2d. Query CandidateAdded sau khi thêm nhiều ứng viên", async function () {
      await voting.connect(owner).addCandidate("Ung Vien A");
      await voting.connect(owner).addCandidate("Ung Vien B");

      const filter = voting.filters.CandidateAdded();
      const events = await voting.queryFilter(filter, 0, "latest");

      // 5 từ constructor + 2 thêm mới = 7
      expect(events.length).to.equal(7);

      // 2 event cuối phải là ứng viên mới
      const last = events[events.length - 1];
      expect(last.args[1]).to.equal("Ung Vien B");

      console.log("\n  📋 Tất cả CandidateAdded:");
      for (const ev of events) {
        console.log(`     id=${ev.args[0]} | name="${ev.args[1]}"`);
      }
    });
  });

  // ═══════════════════════════════════════════════════════
  // NHÓM 3: CandidateRemoved
  // ═══════════════════════════════════════════════════════
  describe("3. CandidateRemoved", function () {
    it("3a. Phát ra CandidateRemoved đúng id và name khi xóa ứng viên", async function () {
      // Ứng viên 1 là "Dinh Manh Duc"
      await expect(voting.connect(owner).removeCandidate(1))
        .to.emit(voting, "CandidateRemoved")
        .withArgs(1n, "Dinh Manh Duc");
    });

    it("3b. KHÔNG phát ra CandidateRemoved khi xóa ứng viên không tồn tại", async function () {
      await expect(
        voting.connect(owner).removeCandidate(99)
      ).to.be.revertedWith("Voting: id ung vien khong hop le");
    });

    it("3c. KHÔNG phát ra CandidateRemoved khi xóa 2 lần cùng ứng viên", async function () {
      await voting.connect(owner).removeCandidate(1); // Lần 1: OK

      await expect(
        voting.connect(owner).removeCandidate(1)     // Lần 2: revert
      ).to.be.revertedWith("Voting: ung vien da bi xoa truoc do");
    });

    it("3d. Query CandidateRemoved sau nhiều lần xóa", async function () {
      await voting.connect(owner).removeCandidate(1);
      await voting.connect(owner).removeCandidate(3);

      const filter = voting.filters.CandidateRemoved();
      const events = await voting.queryFilter(filter, 0, "latest");

      expect(events.length).to.equal(2);
      expect(events[0].args[1]).to.equal("Dinh Manh Duc");
      expect(events[1].args[1]).to.equal("Nguyen Ngoc Thuy");

      console.log("\n  📋 CandidateRemoved:");
      for (const ev of events) {
        console.log(`     id=${ev.args[0]} | name="${ev.args[1]}"`);
      }
    });
  });

  // ═══════════════════════════════════════════════════════
  // NHÓM 4: VotingTimeSet
  // ═══════════════════════════════════════════════════════
  describe("4. VotingTimeSet", function () {
    it("4a. Phát ra VotingTimeSet với startTime và endTime đúng", async function () {
      const now       = Math.floor(Date.now() / 1000);
      const startTime = now + 60;        // bắt đầu sau 1 phút
      const endTime   = startTime + 3600; // kéo dài 1 tiếng

      await expect(voting.connect(owner).setVotingTime(startTime, endTime))
        .to.emit(voting, "VotingTimeSet")
        .withArgs(BigInt(startTime), BigInt(endTime));
    });

    it("4b. KHÔNG phát ra VotingTimeSet khi endTime ở quá khứ", async function () {
      const pastStart = Math.floor(Date.now() / 1000) - 7200;
      const pastEnd   = Math.floor(Date.now() / 1000) - 3600;

      await expect(
        voting.connect(owner).setVotingTime(pastStart, pastEnd)
      ).to.be.revertedWith("Voting: endTime phai trong tuong lai");
    });

    it("4c. KHÔNG phát ra VotingTimeSet khi startTime >= endTime", async function () {
      const now = Math.floor(Date.now() / 1000);
      await expect(
        voting.connect(owner).setVotingTime(now + 3600, now + 60)
      ).to.be.revertedWith("Voting: startTime phai truoc endTime");
    });

    it("4d. Query VotingTimeSet sau khi thiết lập", async function () {
      const now = Math.floor(Date.now() / 1000);
      const st  = now + 100;
      const et  = now + 7200;

      await voting.connect(owner).setVotingTime(st, et);

      const filter = voting.filters.VotingTimeSet();
      const events = await voting.queryFilter(filter, 0, "latest");

      expect(events.length).to.equal(1);
      expect(events[0].args[0]).to.equal(BigInt(st));
      expect(events[0].args[1]).to.equal(BigInt(et));

      console.log("\n  📋 VotingTimeSet:");
      console.log(`     startTime=${events[0].args[0]} | endTime=${events[0].args[1]}`);
    });
  });

  // ═══════════════════════════════════════════════════════
  // NHÓM 5: VoterWhitelisted
  // ═══════════════════════════════════════════════════════
  describe("5. VoterWhitelisted", function () {
    it("5a. Phát ra VoterWhitelisted đúng địa chỉ khi addToWhitelist", async function () {
      await expect(voting.connect(owner).addToWhitelist(voter1.address))
        .to.emit(voting, "VoterWhitelisted")
        .withArgs(voter1.address);
    });

    it("5b. Phát ra VoterWhitelisted cho nhiều địa chỉ qua addBatchToWhitelist", async function () {
      const voters = [voter1.address, voter2.address, voter3.address];

      const tx = await voting.connect(owner).addBatchToWhitelist(voters);
      const receipt = await tx.wait();

      // Lọc sự kiện VoterWhitelisted từ receipt
      const filter = voting.filters.VoterWhitelisted();
      const events = await voting.queryFilter(filter, receipt.blockNumber, receipt.blockNumber);

      expect(events.length).to.equal(3);

      const emittedAddresses = events.map(e => e.args[0]);
      expect(emittedAddresses).to.include(voter1.address);
      expect(emittedAddresses).to.include(voter2.address);
      expect(emittedAddresses).to.include(voter3.address);

      console.log("\n  📋 VoterWhitelisted (batch):");
      for (const ev of events) {
        console.log(`     voter = ${ev.args[0]}`);
      }
    });

    it("5c. KHÔNG phát ra VoterWhitelisted khi non-owner thêm whitelist", async function () {
      await expect(
        voting.connect(voter1).addToWhitelist(voter2.address)
      ).to.be.revertedWith("Voting: chi owner moi duoc thuc hien");
    });

    it("5d. Voter được whitelist có thể vote khi whitelistEnabled = true", async function () {
      await voting.connect(owner).setWhitelistEnabled(true);
      await voting.connect(owner).addToWhitelist(voter1.address);

      // Vote và kiểm tra event
      await expect(voting.connect(voter1).vote(1))
        .to.emit(voting, "votedEvent")
        .withArgs(1n);
    });
  });

  // ═══════════════════════════════════════════════════════
  // NHÓM 6: VoterRemovedFromWhitelist
  // ═══════════════════════════════════════════════════════
  describe("6. VoterRemovedFromWhitelist", function () {
    it("6a. Phát ra VoterRemovedFromWhitelist đúng địa chỉ khi xóa khỏi whitelist", async function () {
      await voting.connect(owner).addToWhitelist(voter1.address);

      await expect(voting.connect(owner).removeFromWhitelist(voter1.address))
        .to.emit(voting, "VoterRemovedFromWhitelist")
        .withArgs(voter1.address);
    });

    it("6b. Voter bị xóa khỏi whitelist không thể vote", async function () {
      await voting.connect(owner).setWhitelistEnabled(true);
      await voting.connect(owner).addToWhitelist(voter1.address);
      await voting.connect(owner).removeFromWhitelist(voter1.address);

      await expect(
        voting.connect(voter1).vote(1)
      ).to.be.revertedWith("Voting: ban khong co trong danh sach cu tri");
    });

    it("6c. Query VoterRemovedFromWhitelist sau nhiều lần xóa", async function () {
      await voting.connect(owner).addToWhitelist(voter1.address);
      await voting.connect(owner).addToWhitelist(voter2.address);
      await voting.connect(owner).removeFromWhitelist(voter1.address);
      await voting.connect(owner).removeFromWhitelist(voter2.address);

      const filter = voting.filters.VoterRemovedFromWhitelist();
      const events = await voting.queryFilter(filter, 0, "latest");

      expect(events.length).to.equal(2);
      expect(events[0].args[0]).to.equal(voter1.address);
      expect(events[1].args[0]).to.equal(voter2.address);

      console.log("\n  📋 VoterRemovedFromWhitelist:");
      for (const ev of events) {
        console.log(`     voter = ${ev.args[0]}`);
      }
    });
  });

  // ═══════════════════════════════════════════════════════
  // NHÓM 7: TỔNG HỢP — Luồng bầu cử hoàn chỉnh
  // ═══════════════════════════════════════════════════════
  describe("7. Luồng hoàn chỉnh (End-to-End Event Flow)", function () {
    it("7a. Toàn bộ luồng: setup → whitelist → vote → kiểm tra tất cả events", async function () {
      // Bước 1: Thêm ứng viên
      await voting.connect(owner).addCandidate("Ung Vien Test");
      const addedFilter = voting.filters.CandidateAdded();
      const addedEvents = await voting.queryFilter(addedFilter, 0, "latest");
      expect(addedEvents.length).to.equal(6); // 5 từ constructor + 1 mới

      // Bước 2: Bật whitelist, thêm voters
      await voting.connect(owner).setWhitelistEnabled(true);
      await voting.connect(owner).addBatchToWhitelist([voter1.address, voter2.address]);
      const wlFilter = voting.filters.VoterWhitelisted();
      const wlEvents = await voting.queryFilter(wlFilter, 0, "latest");
      expect(wlEvents.length).to.equal(2);

      // Bước 3: Thiết lập thời gian (không bật timing để vote ngay)
      // => Giữ timingEnabled = false để vote tự do

      // Bước 4: Bỏ phiếu
      await voting.connect(voter1).vote(1);
      await voting.connect(voter2).vote(6); // Ứng viên mới thêm

      const voteFilter = voting.filters.votedEvent();
      const voteEvents = await voting.queryFilter(voteFilter, 0, "latest");
      expect(voteEvents.length).to.equal(2);

      // Bước 5: Xóa 1 ứng viên (sau khi vote không có timing)
      await voting.connect(owner).removeCandidate(2);
      const removeFilter = voting.filters.CandidateRemoved();
      const removeEvents = await voting.queryFilter(removeFilter, 0, "latest");
      expect(removeEvents.length).to.equal(1);
      expect(removeEvents[0].args[1]).to.equal("Nguyen Gia Tuong");

      // ─── Tổng kết ───────────────────────────────────────
      console.log("\n  ✅ TỔNG KẾT SỰ KIỆN:");
      console.log(`     CandidateAdded      : ${addedEvents.length}`);
      console.log(`     VoterWhitelisted    : ${wlEvents.length}`);
      console.log(`     votedEvent          : ${voteEvents.length}`);
      console.log(`     CandidateRemoved    : ${removeEvents.length}`);
    });
  });
});