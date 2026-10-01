// Shared zstd "raw content" dictionary, v1. Short texts compress badly alone because they have few
// internal repeats; this gives the compressor common hiring/Indian-English phrases to reference.
//
// Benchmark-only: it lost to Brotli's built-in dictionary on Ghosted text, so the API doesn't use it.
// zstd favours content near the END of a raw dictionary, so the most common phrases go last.

export const DICTIONARY_V1 = [
  "Bengaluru Hyderabad Pune Chennai Mumbai Gurugram Noida Delhi Kolkata Ahmedabad Kochi Remote Hybrid Onsite ",
  "SDE I SDE II SDE III Senior Software Engineer Backend Engineer Frontend Developer Full Stack Developer Data Analyst Data Scientist ",
  "Product Manager Product Designer UX Researcher DevOps Engineer QA Engineer QA Lead Sales Lead Marketing Manager HR Business Partner ",
  "Talent Acquisition recruiter hiring manager panel interview technical round system design round coding round HR round managerial round ",
  "take-home assignment case study presentation portfolio review background verification BGV reference check notice period joining date ",
  "offer letter offer revoked offer withdrawn rescinded counter offer CTC fixed pay variable pay ESOPs joining bonus relocation LPA lakhs per annum ",
  "â‚¹10 LPA â‚¹12 LPA â‚¹15 LPA â‚¹18 LPA â‚¹20 LPA â‚¹24 LPA â‚¹30 LPA 30% hike 40% hike expected CTC current CTC in-hand salary ",
  "They said they would get back to me. I never heard back. No response after the final round. The recruiter stopped replying. ",
  "I followed up twice and got no reply. It has been weeks. It's been a month. Ghosted after the interview. Complete silence. ",
  "The interview was well organised and the interviewers were respectful. They gave me useful feedback. Great experience overall. ",
  "The job description did not match the actual role. The salary range in the job post was not what they offered. Lowball offer. ",
  "unpaid work weekend assignment toxic culture work-life balance long hours no appraisal layoffs rescheduled cancelled last minute ",
  "Hi, just following up on my application. Any update? Thanks for your time. Looking forward to hearing from you. Please let me know. ",
  "What is your current CTC and expected CTC? What is your notice period? Can you join immediately? We will get back to you. ",
  "same here this happened to me too exactly the same thing thank you for sharing this is so relatable avoid this company red flag ",
  "Congratulations! Good luck with your job search. Don't give up. You deserve better. Thanks for the heads up. Totally agree. ",
  "I applied through LinkedIn Naukri referral campus placement. After the HR round they asked for my payslips and bank statements. ",
  "the company the interview the recruiter the offer the role the team the manager the process the salary the round the feedback ",
  " and the to of a in is it that for was they me my I you with on but not have this after we at be be so no ",
].join("");
