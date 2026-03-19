import { api } from './witnessledger-frontend/src/lib/api'; // Or use axios/fetch
// Script to test OTP flow directly against local server
async function test() {
  const email = `test-${Date.now()}@example.com`;
  console.log('Testing with email:', email);
  
  try {
    const res1 = await fetch('http://localhost:5000/api/otp/send', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ email })
    });
    console.log('Send OTP:', await res1.json());
    
    // We need to fetch the OTP from the DB directly since we don't have the email
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const otpRecord = await prisma.emailOtp.findFirst({ where: { email }});
    console.log('OTP generated:', otpRecord?.otp);
    
    if (!otpRecord) return console.error('No OTP found');
    
    const res2 = await fetch('http://localhost:5000/api/otp/verify', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ email, otp: otpRecord.otp })
    });
    console.log('Verify OTP:', await res2.json());
    
    const res3 = await fetch('http://localhost:5000/api/auth/register', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ name: 'Test User', email, password: 'password123' })
    });
    console.log('Register:', res3.status, await res3.json());
    
  } catch (err) {
    console.error(err);
  }
}
test();
