#!/usr/bin/env python3
"""
Email Sender Module for EPC17 Event Management System
Handles SMTP email sending for bulk driver stats distribution
Uses Gmail SMTP with environment variable credentials
"""

import smtplib
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from typing import List, Dict, Tuple
import socket

class EmailSender:
    """Email sending utility with Gmail SMTP support"""
    
    def __init__(self):
        self.smtp_server = "smtp.gmail.com"
        self.smtp_port = 587  # TLS port
        self.email_user = os.getenv('EMAIL_USER', '')
        self.email_pass = os.getenv('EMAIL_PASS', '')
        
        # Validate configuration
        if not self.email_user or not self.email_pass:
            print("⚠️  EMAIL_USER or EMAIL_PASS not set in environment variables")
    
    def check_internet_connection(self) -> bool:
        """
        Check if internet connection is available
        Returns True if connected, False otherwise
        """
        try:
            # Try to connect to Google's DNS server
            socket.create_connection(("8.8.8.8", 53), timeout=3)
            return True
        except OSError:
            return False
    
    def validate_config(self) -> Tuple[bool, str]:
        """
        Validate email configuration
        Returns (is_valid, error_message)
        """
        if not self.email_user:
            return False, "EMAIL_USER not configured"
        
        if not self.email_pass:
            return False, "EMAIL_PASS not configured"
        
        if not self.check_internet_connection():
            return False, "No internet connection"
        
        return True, ""
    
    def send_email_with_attachment(
        self, 
        recipient_email: str, 
        recipient_name: str,
        subject: str,
        body: str,
        attachment_data: bytes,
        attachment_filename: str
    ) -> Tuple[bool, str]:
        """
        Send email with PDF attachment
        
        Args:
            recipient_email: Recipient's email address
            recipient_name: Recipient's name
            subject: Email subject
            body: Email body text
            attachment_data: PDF file data as bytes
            attachment_filename: Name for the attachment file
            
        Returns:
            (success: bool, message: str)
        """
        try:
            # Validate recipient email
            if not recipient_email or '@' not in recipient_email:
                return False, f"Invalid email address for {recipient_name}"
            
            # Create message
            msg = MIMEMultipart()
            msg['From'] = self.email_user
            msg['To'] = recipient_email
            msg['Subject'] = subject
            
            # Attach body
            msg.attach(MIMEText(body, 'plain'))
            
            # Attach PDF
            attachment = MIMEBase('application', 'pdf')
            attachment.set_payload(attachment_data)
            encoders.encode_base64(attachment)
            attachment.add_header(
                'Content-Disposition',
                f'attachment; filename={attachment_filename}'
            )
            msg.attach(attachment)
            
            # Send email
            server = smtplib.SMTP(self.smtp_server, self.smtp_port)
            server.starttls()
            server.login(self.email_user, self.email_pass)
            server.send_message(msg)
            server.quit()
            
            return True, f"Email sent successfully to {recipient_name}"
            
        except smtplib.SMTPAuthenticationError:
            return False, "Authentication failed. Check EMAIL_USER and EMAIL_PASS"
        except smtplib.SMTPException as e:
            return False, f"SMTP error: {str(e)}"
        except Exception as e:
            return False, f"Failed to send email: {str(e)}"
    
    def send_bulk_emails(
        self,
        recipients: List[Dict],
        subject: str,
        body_template: str,
        event_name: str
    ) -> Dict:
        """
        Send bulk emails to multiple recipients
        
        Args:
            recipients: List of dicts with 'email', 'name', 'pdf_data', 'pdf_filename'
            subject: Email subject
            body_template: Email body template (use {name} and {event} placeholders)
            event_name: Name of the event
            
        Returns:
            Dict with success_count, failed_count, and details
        """
        results = {
            'success_count': 0,
            'failed_count': 0,
            'details': []
        }
        
        # Validate configuration first
        is_valid, error_msg = self.validate_config()
        if not is_valid:
            results['error'] = error_msg
            results['failed_count'] = len(recipients)
            return results
        
        for recipient in recipients:
            try:
                name = recipient.get('name', 'Driver')
                email = recipient.get('email', '')
                pdf_data = recipient.get('pdf_data')
                pdf_filename = recipient.get('pdf_filename', 'stats.pdf')
                
                # Skip if no email provided
                if not email:
                    results['failed_count'] += 1
                    results['details'].append({
                        'name': name,
                        'email': email,
                        'status': 'failed',
                        'message': 'No email address provided'
                    })
                    continue
                
                # Format email body
                body = body_template.format(name=name, event=event_name)
                
                # Send email
                success, message = self.send_email_with_attachment(
                    recipient_email=email,
                    recipient_name=name,
                    subject=subject,
                    body=body,
                    attachment_data=pdf_data,
                    attachment_filename=pdf_filename
                )
                
                if success:
                    results['success_count'] += 1
                    results['details'].append({
                        'name': name,
                        'email': email,
                        'status': 'success',
                        'message': message
                    })
                else:
                    results['failed_count'] += 1
                    results['details'].append({
                        'name': name,
                        'email': email,
                        'status': 'failed',
                        'message': message
                    })
                    
            except Exception as e:
                results['failed_count'] += 1
                results['details'].append({
                    'name': recipient.get('name', 'Unknown'),
                    'email': recipient.get('email', 'Unknown'),
                    'status': 'failed',
                    'message': str(e)
                })
        
        return results


def create_default_body_template() -> str:
    """Create default email body template"""
    return """Dear {name},

Thank you for participating in {event}!

Please find attached your performance statistics for this event. This report includes:
- Your race results and standings
- Win percentage and average position
- Lane performance breakdown

We hope you enjoyed the event and look forward to seeing you at future races!

Best regards,
EPC Technology Event Management Team

---
This is an automated email. Please do not reply to this message.
"""


if __name__ == '__main__':
    # Test email configuration
    sender = EmailSender()
    is_valid, message = sender.validate_config()
    if is_valid:
        print("✅ Email configuration is valid")
    else:
        print(f"❌ Email configuration error: {message}")

